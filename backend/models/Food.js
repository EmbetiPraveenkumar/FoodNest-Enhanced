const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  name: {
    type: String,
    required: true,
  },

  category: {
    type: String,
    required: true,
  },

  quantity: {
    type: Number,
    required: true,
  },

  expiryDate: {
    type: Date,
    required: true,
  },

  status: {
    type: String,
    default: "In Stock",
  },
});

module.exports = mongoose.model("Food", foodSchema);
