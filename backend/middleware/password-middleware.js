import bcrypt from "bcrypt";

export const hashPasswordMiddleware = async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);

    this.password = await bcrypt.hash(this.password, salt);

    next();
  } catch (error) {
    next(error);
  }
};

export const comparePassword = async function (candidatePassword) {
  if (!this.password) {
    throw new Error("Password not found");
  }

  return await bcrypt.compare(candidatePassword, this.password);
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
};
