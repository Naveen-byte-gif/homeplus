/**
 * Firebase Private Key Validator
 * This script helps validate and format Firebase private keys
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🔍 Firebase Private Key Validator');
console.log('==================================\n');

function validatePrivateKey(key) {
  const issues = [];
  
  if (!key) {
    return { valid: false, issues: ['Private key is empty'] };
  }
  
  // Check for BEGIN marker
  if (!key.includes('-----BEGIN')) {
    issues.push('Missing BEGIN marker');
  }
  
  // Check for END marker
  if (!key.includes('-----END')) {
    issues.push('Missing END marker');
  }
  
  // Check for newlines
  if (!key.includes('\n')) {
    issues.push('No newlines found - key must have newlines');
  }
  
  // Extract key content
  const keyContent = key
    .replace(/-----BEGIN.*-----/g, '')
    .replace(/-----END.*-----/g, '')
    .replace(/\s/g, '');
  
  if (keyContent.length < 100) {
    issues.push(`Key content too short (${keyContent.length} chars, expected >100)`);
  }
  
  // Check for proper format
  const lines = key.split('\n');
  const hasBeginLine = lines.some(line => line.includes('BEGIN'));
  const hasEndLine = lines.some(line => line.includes('END'));
  
  if (!hasBeginLine || !hasEndLine) {
    issues.push('BEGIN/END markers not on separate lines');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    keyContentLength: keyContent.length,
    totalLength: key.length
  };
}

function formatPrivateKey(key) {
  // Replace escaped newlines
  let formatted = key.replace(/\\n/g, '\n');
  
  // If no newlines, try to add them
  if (!formatted.includes('\n')) {
    // Try to detect where newlines should be
    if (formatted.includes('-----BEGIN') && formatted.includes('-----END')) {
      formatted = formatted
        .replace(/-----BEGIN PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n')
        .replace(/-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----')
        .replace(/\n+/g, '\n')
        .trim();
    }
  }
  
  // Clean up formatting
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Ensure proper format
  const lines = formatted.split('\n');
  const beginIndex = lines.findIndex(line => line.includes('BEGIN'));
  const endIndex = lines.findIndex(line => line.includes('END'));
  
  if (beginIndex !== -1 && endIndex !== -1) {
    // Reconstruct with proper spacing
    const header = lines[beginIndex];
    const footer = lines[endIndex];
    const content = lines.slice(beginIndex + 1, endIndex).join('\n').replace(/\s/g, '');
    
    // Format content in 64-char lines (standard for PEM)
    const formattedContent = content.match(/.{1,64}/g)?.join('\n') || content;
    
    formatted = `${header}\n${formattedContent}\n${footer}`;
  }
  
  return formatted;
}

console.log('Paste your Firebase private key (press Enter twice when done):\n');

let input = '';
let emptyLineCount = 0;

rl.on('line', (line) => {
  if (line.trim() === '') {
    emptyLineCount++;
    if (emptyLineCount >= 2 && input.trim() !== '') {
      // Validate
      const validation = validatePrivateKey(input);
      
      console.log('\n📊 Validation Results:');
      console.log('=====================');
      
      if (validation.valid) {
        console.log('✅ Private key format is VALID\n');
        console.log(`Key content length: ${validation.keyContentLength} characters`);
        console.log(`Total key length: ${validation.totalLength} characters\n`);
        
        console.log('✅ You can use this key in your .env file:');
        console.log('\nFIREBASE_PRIVATE_KEY="' + input.replace(/\n/g, '\\n') + '"\n');
        
      } else {
        console.log('❌ Private key format has issues:\n');
        validation.issues.forEach(issue => {
          console.log(`   ❌ ${issue}`);
        });
        
        console.log('\n🔄 Attempting to auto-format...\n');
        const formatted = formatPrivateKey(input);
        const formattedValidation = validatePrivateKey(formatted);
        
        if (formattedValidation.valid) {
          console.log('✅ Auto-formatting successful!\n');
          console.log('✅ Use this formatted key in your .env file:');
          console.log('\nFIREBASE_PRIVATE_KEY="' + formatted.replace(/\n/g, '\\n') + '"\n');
        } else {
          console.log('❌ Auto-formatting failed. Please check your key manually.\n');
        }
      }
      
      rl.close();
    }
  } else {
    emptyLineCount = 0;
    input += line + '\n';
  }
});

