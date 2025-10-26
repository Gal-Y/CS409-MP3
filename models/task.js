// Load required packages
var mongoose = require('mongoose');

// Define our task schema
var TaskSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    deadline: {
        type: Date,
        required: [true, 'Deadline is required']
    },
    completed: {
        type: Boolean,
        default: false
    },
    assignedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assignedUserName: {
        type: String,
        default: 'unassigned',
        trim: true
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false
});

// Export the Mongoose model
module.exports = mongoose.model('Task', TaskSchema);
