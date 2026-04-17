const prisma = require('../lib/prisma');

/**
 * Generates a unique Workspace ID for a user.
 * Format: [Company(3)][Role(3)][Random(4-5)]
 * 
 * @param {string} companyName - Name of the tenant/company
 * @param {string} roleName - Name of the role (Enum or CustomRole)
 * @param {string} existingRandomPart - (Optional) The random digit part from a previous ID to try and preserve
 * @returns {Promise<string>} - The generated unique workspace ID
 */
const generateWorkspaceId = async (companyName, roleName, existingRandomPart = null) => {
  const getInitials = (str) => {
    if (!str) return 'XYZ';
    return str.substring(0, 3).toUpperCase().padEnd(3, 'X');
  };

  const companyPart = getInitials(companyName);
  const rolePart = getInitials(roleName);
  const prefix = `${companyPart}${rolePart}`;

  // 1. If we have an existing random part, try that first (for promotions/role changes)
  if (existingRandomPart) {
    const candidateId = `${prefix}${existingRandomPart}`;
    const exists = await prisma.user.findUnique({
      where: { workspaceId: candidateId },
      select: { id: true }
    });
    if (!exists) return candidateId;
  }

  // 2. Generate new random part until unique
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Generate 5 random digits (using 5 for better collision avoidance)
    const randomPart = Math.floor(10000 + Math.random() * 90000).toString();
    const candidateId = `${prefix}${randomPart}`;

    const exists = await prisma.user.findUnique({
      where: { workspaceId: candidateId },
      select: { id: true }
    });

    if (!exists) return candidateId;
    attempts++;
  }

  // Fallback if somehow we hit too many collisions (extremely unlikely with 5 digits)
  // Should probably throw an error or use a longer random part
  const timestampPart = Date.now().toString().slice(-5);
  return `${prefix}${timestampPart}`;
};

module.exports = { generateWorkspaceId };
