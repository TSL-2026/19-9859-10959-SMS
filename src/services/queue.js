const Queue = require('bull');
const logger = require('./logger');

const taskQueue = new Queue('tasks', process.env.REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

taskQueue.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id, name: job.name });
});

taskQueue.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job.id, name: job.name, error: err.message });
});

async function addTask(name, data) {
  const job = await taskQueue.add(name, data);
  return job;
}

module.exports = { taskQueue, addTask };
