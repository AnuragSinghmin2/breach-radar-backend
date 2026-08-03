const mongoose = require('mongoose');

// Generic atomic counter, reusable for any sequence (e.g. ticket numbers, invoice numbers).
// Each document is identified by `key` and holds the last issued sequence value.
const CounterSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

async function getNextSequence(key) {
  const counter = await mongoose.model('Counter').findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

CounterSchema.statics.getNextSequence = function (key) {
  return getNextSequence(key);
};

module.exports = mongoose.model('Counter', CounterSchema);