const mongoose = require("mongoose");

const DealSchema = new mongoose.Schema({
  title: String,
  price: Number,
  views: {
    type: Number,
    default: 0,
  },
  remainingQuantity: Number,
});

module.exports = mongoose.model("Deal", DealSchema);
