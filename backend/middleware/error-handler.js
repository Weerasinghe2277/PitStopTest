import { CustomAPIError } from "../errors/custom-error.js";

const errorHandlerMiddleware = (err, req, res, next) => {
  let customError = {
    statusCode: err.statusCode || 500,
    msg: err.message || "Something went wrong, please try again",
  };

  if (err instanceof CustomAPIError) {
    return res.status(err.statusCode).json({ msg: err.message });
  }

  if (err.name === "ValidationError") {
    customError.msg = Object.values(err.errors)
      .map((item) => item.message)
      .join(", ");
    customError.statusCode = 400;
  }

  if (err.code && err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    customError.msg = `${field}: '${value}' already exists. Please choose a different ${field}`;
    customError.statusCode = 400;
  }

  if (err.name === "CastError") {
    customError.msg = `No item found with id: ${err.value}`;
    customError.statusCode = 404;
  }

  if (err.name === "MongoNetworkError") {
    customError.msg = "Database connection failed. Please try again later";
    customError.statusCode = 500;
  }

  if (err.name === "MongooseServerSelectionError") {
    customError.msg = "Database server is unavailable. Please try again later";
    customError.statusCode = 503;
  }

  return res.status(customError.statusCode).json({ msg: customError.msg });
};

export default errorHandlerMiddleware;