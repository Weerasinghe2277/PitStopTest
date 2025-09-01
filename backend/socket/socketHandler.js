import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Message from "../models/Message.js";

class SocketHandler {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  // Authentication middleware for socket connections
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error("Authentication error: No token provided"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user || user.status !== "active") {
          return next(new Error("Authentication error: Invalid user"));
        }

        socket.userId = user._id.toString();
        socket.userRole = user.role;
        socket.userData = {
          userId: user.userId,
          name: user.fullName,
          role: user.role,
        };

        next();
      } catch (error) {
        next(new Error("Authentication error: Invalid token"));
      }
    });
  }

  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`User ${socket.userData.userId} connected with socket ${socket.id}`);
      
      // Store user connection
      this.connectedUsers.set(socket.userId, socket.id);
      this.userSockets.set(socket.id, socket.userId);

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);

      // Emit online status to relevant users
      this.emitUserStatus(socket.userId, "online");

      // Handle joining conversation
      socket.on("join_conversation", async (data) => {
        await this.handleJoinConversation(socket, data);
      });

      // Handle sending message
      socket.on("send_message", async (data) => {
        await this.handleSendMessage(socket, data);
      });

      // Handle marking messages as read
      socket.on("mark_as_read", async (data) => {
        await this.handleMarkAsRead(socket, data);
      });

      // Handle typing indicators
      socket.on("typing_start", (data) => {
        this.handleTyping(socket, data, true);
      });

      socket.on("typing_stop", (data) => {
        this.handleTyping(socket, data, false);
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`User ${socket.userData.userId} disconnected`);
        
        // Remove user from connected users
        this.connectedUsers.delete(socket.userId);
        this.userSockets.delete(socket.id);

        // Emit offline status
        this.emitUserStatus(socket.userId, "offline");
      });
    });
  }

  async handleJoinConversation(socket, data) {
    try {
      const { recipientId } = data;

      // Validate recipient exists and role compatibility
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        socket.emit("error", { message: "Recipient not found" });
        return;
      }

      // Check if conversation is allowed based on roles
      if (!this.isConversationAllowed(socket.userRole, recipient.role)) {
        socket.emit("error", { message: "Conversation not allowed between these roles" });
        return;
      }

      // Generate conversation ID
      const conversationId = Message.generateConversationId(socket.userId, recipientId);
      
      // Join conversation room
      socket.join(conversationId);

      // Get conversation history
      const messages = await Message.getConversation(socket.userId, recipientId);

      // Send conversation data
      socket.emit("conversation_joined", {
        conversationId,
        recipient: {
          _id: recipient._id,
          userId: recipient.userId,
          name: recipient.fullName,
          role: recipient.role,
        },
        messages,
        isRecipientOnline: this.connectedUsers.has(recipientId),
      });

    } catch (error) {
      console.error("Error joining conversation:", error);
      socket.emit("error", { message: "Failed to join conversation" });
    }
  }

  async handleSendMessage(socket, data) {
    try {
      const { recipientId, content, messageType = "text" } = data;

      // Validate input
      if (!recipientId || !content?.trim()) {
        socket.emit("error", { message: "Recipient and content are required" });
        return;
      }

      // Validate recipient
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        socket.emit("error", { message: "Recipient not found" });
        return;
      }

      // Check conversation permissions
      if (!this.isConversationAllowed(socket.userRole, recipient.role)) {
        socket.emit("error", { message: "Not authorized to send message to this user" });
        return;
      }

      // Create message
      const conversationId = Message.generateConversationId(socket.userId, recipientId);
      
      const message = await Message.create({
        conversationId,
        sender: socket.userId,
        recipient: recipientId,
        content: content.trim(),
        messageType,
        status: "sent",
      });

      // Populate sender and recipient info
      await message.populate("sender", "userId profile.firstName profile.lastName role");
      await message.populate("recipient", "userId profile.firstName profile.lastName role");

      // Update message status to delivered if recipient is online
      if (this.connectedUsers.has(recipientId)) {
        message.status = "delivered";
        await message.save();
      }

      // Emit to conversation room
      this.io.to(conversationId).emit("new_message", message);

      // Emit to recipient's personal room for notifications
      this.io.to(`user_${recipientId}`).emit("message_notification", {
        conversationId,
        sender: {
          _id: socket.userId,
          userId: socket.userData.userId,
          name: socket.userData.name,
          role: socket.userData.role,
        },
        preview: content.substring(0, 50) + (content.length > 50 ? "..." : ""),
        timestamp: message.createdAt,
      });

    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  }

  async handleMarkAsRead(socket, data) {
    try {
      const { conversationId } = data;

      if (!conversationId) {
        socket.emit("error", { message: "Conversation ID is required" });
        return;
      }

      // Mark messages as read
      await Message.markAsRead(conversationId, socket.userId);

      // Notify the conversation that messages were read
      socket.to(conversationId).emit("messages_read", {
        conversationId,
        readBy: socket.userId,
        readAt: new Date(),
      });

    } catch (error) {
      console.error("Error marking messages as read:", error);
      socket.emit("error", { message: "Failed to mark messages as read" });
    }
  }

  handleTyping(socket, data, isTyping) {
    try {
      const { conversationId } = data;

      if (!conversationId) {
        return;
      }

      // Emit typing status to others in the conversation
      socket.to(conversationId).emit("typing_status", {
        userId: socket.userId,
        userName: socket.userData.name,
        isTyping,
      });

    } catch (error) {
      console.error("Error handling typing:", error);
    }
  }

  emitUserStatus(userId, status) {
    // Emit status to users who have conversations with this user
    this.io.emit("user_status_change", {
      userId,
      status,
      timestamp: new Date(),
    });
  }

  // Check if conversation is allowed between roles
  isConversationAllowed(role1, role2) {
    const allowedConversations = [
      ["employee", "hr_officer"],
      ["hr_officer", "insurance_agent"],
      ["admin", "hr_officer"],
      ["admin", "insurance_agent"],
      ["admin", "employee"],
    ];

    return allowedConversations.some(
      ([r1, r2]) => (role1 === r1 && role2 === r2) || (role1 === r2 && role2 === r1)
    );
  }

  // Method to send system messages (for claim updates, etc.)
  async sendSystemMessage(senderId, recipientId, content, metadata = {}) {
    try {
      const conversationId = Message.generateConversationId(senderId, recipientId);
      
      const message = await Message.create({
        conversationId,
        sender: senderId,
        recipient: recipientId,
        content,
        messageType: "system",
        metadata,
      });

      await message.populate("sender", "userId profile.firstName profile.lastName role");
      await message.populate("recipient", "userId profile.firstName profile.lastName role");

      // Emit to conversation and recipient's room
      this.io.to(conversationId).emit("new_message", message);
      this.io.to(`user_${recipientId}`).emit("system_notification", {
        conversationId,
        content,
        metadata,
        timestamp: message.createdAt,
      });

      return message;
    } catch (error) {
      console.error("Error sending system message:", error);
      throw error;
    }
  }
}

export default SocketHandler;