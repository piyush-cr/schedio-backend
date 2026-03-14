import * as fs from 'fs';
import * as path from 'path';

/**
 * Remove comments from TypeScript/JavaScript code
 * Handles: // single-line, /* multi-line *, and /** JSDoc * /
 */
function removeComments(code: string): string {
  // Remove single-line comments (but not in strings)
  // Remove multi-line comments including JSDoc
  // This regex handles most cases while preserving strings
  
  const result: string[] = [];
  let i = 0;
  let inString: string | null = null;
  let inTemplateString = false;
  
  while (i < code.length) {
    const char = code[i];
    const nextChar = code[i + 1];
    
    // Handle string literals
    if (!inString && !inTemplateString && (char === '"' || char === "'")) {
      inString = char;
      result.push(char);
      i++;
      continue;
    }
    
    if (inString && char === inString && code[i - 1] !== '\\') {
      inString = null;
      result.push(char);
      i++;
      continue;
    }
    
    // Handle template literals
    if (!inString && !inTemplateString && char === '`') {
      inTemplateString = true;
      result.push(char);
      i++;
      continue;
    }
    
    if (inTemplateString && char === '`' && code[i - 1] !== '\\') {
      inTemplateString = false;
      result.push(char);
      i++;
      continue;
    }
    
    // Skip comments when not in string
    if (!inString && !inTemplateString) {
      // Single-line comment
      if (char === '/' && nextChar === '/') {
        // Skip until end of line
        while (i < code.length && code[i] !== '\n') {
          i++;
        }
        // Keep the newline
        if (i < code.length) {
          result.push('\n');
          i++;
        }
        continue;
      }
      
      // Multi-line comment or JSDoc
      if (char === '/' && nextChar === '*') {
        i += 2; // Skip /*
        while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) {
          i++;
        }
        i += 2; // Skip */
        continue;
      }
    }
    
    result.push(char);
    i++;
  }
  
  return result.join('');
}

/**
 * Process a single file
 */
function processFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const cleaned = removeComments(content);
    
    // Only write if content changed
    if (cleaned !== content) {
      fs.writeFileSync(filePath, cleaned, 'utf-8');
      console.log(`✓ Removed comments: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error);
    return false;
  }
}

/**
 * Recursively find all TS/JS files in a directory
 */
function findFiles(dir: string, excludeDirs: string[] = []): string[] {
  const files: string[] = [];
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip excluded directories
    if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
      continue;
    }
    
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, excludeDirs));
    }
  }
  
  return files;
}

// Main execution
const srcDir = path.join(__dirname, 'src');
const excludeDirs = ['__tests__', 'node_modules', 'coverage'];

console.log('Removing comments from TypeScript/JavaScript files...\n');

const files = findFiles(srcDir, excludeDirs);
let processedCount = 0;

for (const file of files) {
  if (processFile(file)) {
    processedCount++;
  }
}

console.log(`\n✓ Complete! Removed comments from ${processedCount} file(s)`);
