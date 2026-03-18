
// import request from 'supertest';
// import express from 'express';
// import taskRoutes from '../../routes/task.routes';

// const app = express();
// app.use(express.json());
// app.use('/api/tasks', taskRoutes);

// describe('Debug Task Routes', () => {
//     it('should respond to GET', async () => {
//         // We expect 401 or similar because of middleware in taskRoutes
//         // But in this minimal setup, we skipped the auth middleware wrapper from the original test
//         // However taskRoutes has its own middleware usages?
//         // In task.routes.ts: router.post('/', authenticate, ...)
//         // So it will use the authenticate middleware imported in task.routes.ts
//         // We need to see if it crashes.
//         try {
//             const res = await request(app).get('/api/tasks');
//             console.log("Response status:", res.status);
//         } catch (e) {
//             console.error("Request failed", e);
//         }
//     });
// });
