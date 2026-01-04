import express from 'express';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';

export const taskTrackingRouter = express.Router();
export const taskEvents = new EventEmitter();

interface TaskStartedPayload {
  taskId: string;
  claudeCodePid?: string;
  timestamp: string;
}

interface TaskFinishedPayload {
  taskId: string;
  success: boolean;
  timestamp: string;
}

// In-memory store for task status
const taskStatusStore = new Map<string, {
  status: string;
  claudeCodePid?: string;
  startedAt?: string;
  finishedAt?: string;
  lastUpdate: string;
}>();

// Endpoint for Claude Code to call when task starts
taskTrackingRouter.post('/api/task/started', (req: Request, res: Response) => {
  const { taskId, claudeCodePid, timestamp } = req.body as TaskStartedPayload;

  // Only accept from localhost for security
  const clientIp = req.ip || req.socket.remoteAddress || '';
  if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1') && !clientIp.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden: Only localhost requests allowed' });
  }

  if (!taskId) {
    return res.status(400).json({ error: 'Missing taskId' });
  }

  console.log(`🤖 Claude Code started working on: ${taskId}`);

  // Store status
  taskStatusStore.set(taskId, {
    status: 'claude-code-working',
    claudeCodePid,
    startedAt: timestamp,
    lastUpdate: new Date().toISOString()
  });

  // Emit event for real-time updates
  taskEvents.emit('task-started', {
    taskId,
    status: 'claude-code-working',
    claudeCodePid,
    timestamp,
    startedAt: timestamp
  });

  res.json({
    success: true,
    message: 'Task status updated to: claude-code-working',
    taskId
  });
});

// Endpoint for Claude Code to call when task finishes
taskTrackingRouter.post('/api/task/finished', (req: Request, res: Response) => {
  const { taskId, success, timestamp } = req.body as TaskFinishedPayload;

  // Only accept from localhost for security
  const clientIp = req.ip || req.socket.remoteAddress || '';
  if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1') && !clientIp.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden: Only localhost requests allowed' });
  }

  if (!taskId) {
    return res.status(400).json({ error: 'Missing taskId' });
  }

  console.log(`✅ Claude Code finished: ${taskId} (success: ${success})`);

  const newStatus = success ? 'needs-verification' : 'needs-fix';

  // Update status
  const existing = taskStatusStore.get(taskId) || { status: '', lastUpdate: '' };
  taskStatusStore.set(taskId, {
    ...existing,
    status: newStatus,
    finishedAt: timestamp,
    lastUpdate: new Date().toISOString()
  });

  // Emit event
  taskEvents.emit('task-finished', {
    taskId,
    status: newStatus,
    timestamp,
    finishedAt: timestamp
  });

  res.json({
    success: true,
    message: `Task status updated to: ${newStatus}`,
    taskId
  });
});

// Get current status of all tasks
taskTrackingRouter.get('/api/task/status', (req: Request, res: Response) => {
  const statuses = Array.from(taskStatusStore.entries()).map(([taskId, data]) => ({
    taskId,
    ...data
  }));

  res.json(statuses);
});

// Get status of specific task
taskTrackingRouter.get('/api/task/status/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const status = taskStatusStore.get(taskId);

  if (!status) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ taskId, ...status });
});
