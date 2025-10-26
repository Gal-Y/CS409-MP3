var express = require('express');
var mongoose = require('mongoose');
var Task = require('../models/task');
var User = require('../models/user');
var apiUtils = require('../utils/api');
var relationships = require('../utils/relationships');

var router = express.Router();
var ApiError = apiUtils.ApiError;
var parseQueryOptions = apiUtils.parseQueryOptions;
var sendResponse = apiUtils.sendResponse;
var handleControllerError = apiUtils.handleControllerError;

function parseSelectParam(query) {
    if (!query.select) {
        return undefined;
    }
    try {
        return JSON.parse(query.select);
    } catch (err) {
        throw new ApiError(400, 'Invalid JSON in query parameter "select"');
    }
}

function parseBoolean(value, fieldName) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        var lowered = value.trim().toLowerCase();
        if (lowered === 'true') {
            return true;
        }
        if (lowered === 'false') {
            return false;
        }
    }
    throw new ApiError(400, 'Invalid boolean value for ' + fieldName);
}

function coerceDeadlineValue(input) {
    if (input === undefined || input === null || input === '') {
        return null;
    }

    var value = input;
    if (typeof value === 'string') {
        value = value.trim();
        if (value === '') {
            return null;
        }
        var numeric = Number(value);
        if (!Number.isNaN(numeric)) {
            value = numeric;
        }
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return null;
        }
        // Accept seconds or milliseconds; convert seconds to ms.
        if (value < 1000000000000) {
            value = value * 1000;
        }
    }

    var deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) {
        return null;
    }
    return deadline;
}

function extractTaskPayload(body) {
    var payload = {};
    payload.name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!payload.name) {
        throw new ApiError(400, 'Task name is required');
    }

    var deadline = coerceDeadlineValue(body.deadline);
    if (!deadline) {
        throw new ApiError(400, 'Task deadline is required');
    }
    payload.deadline = deadline;

    payload.description = typeof body.description === 'string' ? body.description.trim() : '';
    var completed = parseBoolean(body.completed, 'completed');
    payload.completed = completed === undefined ? false : completed;

    payload.assignedUser = body.assignedUser !== undefined ? body.assignedUser : null;

    return payload;
}

router.get('/', async function (req, res) {
    try {
        var queryOptions = parseQueryOptions(req.query, { defaultLimit: 100 });
        var dbQuery = Task.find(queryOptions.where);

        if (queryOptions.select) {
            dbQuery.select(queryOptions.select);
        }
        if (queryOptions.sort) {
            dbQuery.sort(queryOptions.sort);
        }
        if (queryOptions.skip) {
            dbQuery.skip(queryOptions.skip);
        }
        if (queryOptions.limit !== undefined) {
            dbQuery.limit(queryOptions.limit);
        }

        if (queryOptions.countOnly) {
            var count = await Task.countDocuments(queryOptions.where);
            sendResponse(res, 200, 'Task count retrieved', { count: count });
            return;
        }

        var tasks = await dbQuery.exec();
        sendResponse(res, 200, 'Tasks retrieved', tasks);
    } catch (err) {
        handleControllerError(res, err, 'Failed to fetch tasks');
    }
});

router.post('/', async function (req, res) {
    try {
        var payload = extractTaskPayload(req.body);
        var task = new Task({
            name: payload.name,
            description: payload.description,
            deadline: payload.deadline,
            completed: payload.completed
        });

        await relationships.applyTaskAssignment(task, payload.assignedUser, task.completed);
        await task.save();

        var freshTask = await Task.findById(task._id);
        sendResponse(res, 201, 'Task created', freshTask);
    } catch (err) {
        handleControllerError(res, err, 'Failed to create task');
    }
});

router.get('/:id', async function (req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(404, 'Task not found');
        }
        var select = parseSelectParam(req.query);
        var dbQuery = Task.findById(req.params.id);
        if (select) {
            dbQuery.select(select);
        }
        var task = await dbQuery.exec();
        if (!task) {
            throw new ApiError(404, 'Task not found');
        }
        sendResponse(res, 200, 'Task retrieved', task);
    } catch (err) {
        handleControllerError(res, err, 'Failed to fetch task');
    }
});

router.put('/:id', async function (req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(404, 'Task not found');
        }
        var task = await Task.findById(req.params.id);
        if (!task) {
            throw new ApiError(404, 'Task not found');
        }

        var payload = extractTaskPayload(req.body);

        task.name = payload.name;
        task.description = payload.description;
        task.deadline = payload.deadline;
        task.completed = payload.completed;

        await relationships.applyTaskAssignment(task, payload.assignedUser, task.completed);
        await task.save();

        var updated = await Task.findById(task._id);
        sendResponse(res, 200, 'Task updated', updated);
    } catch (err) {
        handleControllerError(res, err, 'Failed to update task');
    }
});

router.delete('/:id', async function (req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            throw new ApiError(404, 'Task not found');
        }
        var task = await Task.findById(req.params.id);
        if (!task) {
            throw new ApiError(404, 'Task not found');
        }

        var assignedUserId = task.assignedUser ? task.assignedUser.toString() : null;
        await task.deleteOne();
        if (assignedUserId) {
            await User.findByIdAndUpdate(assignedUserId, { $pull: { pendingTasks: task._id } });
        }

        sendResponse(res, 200, 'Task deleted', task);
    } catch (err) {
        handleControllerError(res, err, 'Failed to delete task');
    }
});

module.exports = router;
