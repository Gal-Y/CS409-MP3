// Load required packages
var mongoose = require('mongoose');

// Define our user schema
var UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        unique: true
    },
    pendingTasks: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task'
        }],
        default: []
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false
});

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);
