var mongoose = require('mongoose');
var User = require('../models/user');
var Task = require('../models/task');
var ApiError = require('./api').ApiError;

function normalizeId(value, fieldName) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'object' && value._id) {
        value = value._id;
    }
    var strValue = String(value).trim();
    if (!mongoose.Types.ObjectId.isValid(strValue)) {
        throw new ApiError(400, 'Invalid identifier provided for ' + fieldName);
    }
    return mongoose.Types.ObjectId(strValue);
}

function normalizeIdArray(values, fieldName) {
    if (!Array.isArray(values)) {
        if (values === undefined || values === null) {
            return [];
        }
        throw new ApiError(400, fieldName + ' must be an array of identifiers');
    }
    var seen = {};
    var result = [];
    values.forEach(function (value) {
        var normalized = normalizeId(value, fieldName);
        if (normalized && !seen[normalized.toString()]) {
            seen[normalized.toString()] = true;
            result.push(normalized);
        }
    });
    return result;
}

function toStringArray(objectIds) {
    return (objectIds || []).map(function (id) {
        return id ? id.toString() : null;
    }).filter(Boolean);
}

async function syncUserPendingTasks(userDoc, pendingTaskIds) {
    var normalizedIds = normalizeIdArray(pendingTaskIds, 'pendingTasks');
    var tasks = await Task.find({ _id: { $in: normalizedIds } });
    if (tasks.length !== normalizedIds.length) {
        throw new ApiError(400, 'One or more pending tasks do not exist');
    }

    var userId = userDoc._id.toString();
    var currentTaskIdStrings = toStringArray(userDoc.pendingTasks);
    var newTaskIdStrings = normalizedIds.map(function (id) {
        return id.toString();
    });

    var tasksToUnassign = currentTaskIdStrings.filter(function (id) {
        return newTaskIdStrings.indexOf(id) === -1;
    }).map(function (id) {
        return mongoose.Types.ObjectId(id);
    });

    if (tasksToUnassign.length > 0) {
        await Task.updateMany(
            { _id: { $in: tasksToUnassign }, assignedUser: userDoc._id },
            { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
        );
    }

    var taskMap = {};
    tasks.forEach(function (task) {
        taskMap[task._id.toString()] = task;
    });

    for (var i = 0; i < newTaskIdStrings.length; i++) {
        var idStr = newTaskIdStrings[i];
        var task = taskMap[idStr];
        var previousUserId = task.assignedUser ? task.assignedUser.toString() : null;
        if (!previousUserId || previousUserId !== userId) {
            if (previousUserId) {
                await User.findByIdAndUpdate(previousUserId, { $pull: { pendingTasks: task._id } });
            }
        }

        task.assignedUser = userDoc._id;
        task.assignedUserName = userDoc.name;
        task.completed = false;
        await task.save();
    }

    userDoc.pendingTasks = normalizedIds;
    await userDoc.save();
}

async function unassignTasksForUser(userId) {
    await Task.updateMany(
        { assignedUser: userId },
        { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
    );
}

async function applyTaskAssignment(taskDoc, assignedUserId, isCompleted) {
    var previousUserId = taskDoc.assignedUser ? taskDoc.assignedUser.toString() : null;
    var normalized = null;
    if (assignedUserId !== null && assignedUserId !== undefined && assignedUserId !== '') {
        normalized = normalizeId(assignedUserId, 'assignedUser');
    }

    var newAssignedUser = null;
    if (!normalized) {
        taskDoc.assignedUser = null;
        taskDoc.assignedUserName = 'unassigned';
    } else {
        var userDoc = await User.findById(normalized);
        if (!userDoc) {
            throw new ApiError(400, 'Assigned user does not exist');
        }
        newAssignedUser = userDoc;
        taskDoc.assignedUser = userDoc._id;
        taskDoc.assignedUserName = userDoc.name;

        if (!isCompleted) {
            await User.findByIdAndUpdate(userDoc._id, { $addToSet: { pendingTasks: taskDoc._id } });
        } else {
            await User.findByIdAndUpdate(userDoc._id, { $pull: { pendingTasks: taskDoc._id } });
        }
    }

    if (previousUserId && (!normalized || previousUserId !== normalized.toString())) {
        await User.findByIdAndUpdate(previousUserId, { $pull: { pendingTasks: taskDoc._id } });
    }

    return newAssignedUser;
}

module.exports = {
    syncUserPendingTasks: syncUserPendingTasks,
    unassignTasksForUser: unassignTasksForUser,
    applyTaskAssignment: applyTaskAssignment
};
