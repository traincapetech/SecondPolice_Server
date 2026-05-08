const { z } = require('zod');

const addEmployeeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  temporaryPassword: z.string().min(8, 'Temporary password must be at least 8 characters long'),
  role: z.enum(['ADMIN', 'EMPLOYEE']),
  customRoleId: z.string().uuid().optional()
});

module.exports = { addEmployeeSchema };
