import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple paths to find package.json (handles both src and dist)
function findPackageJson(): any {
  const possiblePaths = [
    join(__dirname, '..', '..', 'package.json'), // From src/utils
    join(__dirname, '..', 'package.json'),       // From dist
    join(process.cwd(), 'package.json'),         // From current working directory
  ];
  
  for (const path of possiblePaths) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      // Try next path
    }
  }
  
  // Fallback if package.json cannot be found
  return { version: '0.1.1', name: 'mcp-secrets-vault' };
}

const packageJson = findPackageJson();

export const PACKAGE_VERSION = packageJson.version as string;
export const PACKAGE_NAME = packageJson.name as string;