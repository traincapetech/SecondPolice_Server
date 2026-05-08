const { z } = require('zod');

const registerSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.enum(['ADMIN', 'EMPLOYEE']).optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Invalid login credentials') // Minimal length match for basic checks
});

module.exports = { registerSchema, loginSchema };
