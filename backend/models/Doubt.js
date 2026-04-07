const mongoose = require('mongoose');

const DoubtSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  topic: {
    type: String,
    default: 'General',
  },
  deadline: {
    type: String,
  },
  priorityScore: {
    type: Number,
    default: 0,
  },
  priorityLabel: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Low',
  },
  reason: {
    type: String,
    default: '',
  },
  learnerId: {
    type: String,
    required: true,
  },
  learnerEmail: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'solved'],
    default: 'pending'
  },
  solverId: {
    type: String,
  },
  solutions: [
    {
      type: {
        type: String,
        enum: ['video', 'image', 'text'],
        required: true
      },
      content: {
        type: String,
        required: true
      },
      professionalId: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Doubt', DoubtSchema);
