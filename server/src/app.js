import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import serviceRoutes from './routes/services.js';
import employeeRoutes from './routes/employees.js';
import appointmentRoutes from './routes/appointments.js';
import invoiceRoutes from './routes/invoices.js';
import availabilityRoutes from './routes/availability.js';
import employeeServicesRoutes from './routes/employeeServices.js';
import hoursRoutes from './routes/hours.js';
import appointmentFieldsRoutes from './routes/appointmentFields.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import dashboardRoutes from './routes/dashboard.js';



const app = express();
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootUploads = path.resolve(__dirname, '../uploads')
if (!fs.existsSync(rootUploads)) fs.mkdirSync(rootUploads, { recursive: true })

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/invoices', invoiceRoutes);

app.use('/api/availability', availabilityRoutes);

app.use('/api/employee-services', employeeServicesRoutes);

app.use('/api/hours', hoursRoutes);

app.use('/api/appointment-fields', appointmentFieldsRoutes)
// serve PDF files from tmp folder
app.use('/static', express.static('tmp'));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')))
app.use('/api/dashboard', dashboardRoutes);

export default app;
