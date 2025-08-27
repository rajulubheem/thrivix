#!/usr/bin/env python3
"""Fix multi-line f-strings with json.dumps in research_streaming.py files"""

import re
import sys

def fix_multiline_fstrings(filename):
    """Fix multi-line f-strings with json.dumps"""
    
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this line starts a problematic yield statement
        if 'yield f"data: {json.dumps({' in line:
            # Collect all lines until we find the closing })}\n\n"
            statement_lines = [line]
            i += 1
            brace_count = line.count('{') - line.count('}')
            
            while i < len(lines) and brace_count > 0:
                statement_lines.append(lines[i])
                brace_count += lines[i].count('{') - lines[i].count('}')
                
                # Check if we've reached the end of the statement
                if '})}\n\n"' in lines[i] or '})}\\n\\n"' in lines[i]:
                    break
                i += 1
            
            # Now we have all the lines for this statement
            # Extract the JSON content
            full_statement = ''.join(statement_lines)
            
            # Extract the json.dumps content
            match = re.search(r'yield f"data: \{json\.dumps\((\{.*?\})\)\}\\n\\n"', full_statement, re.DOTALL)
            if match:
                json_content = match.group(1)
                
                # Calculate proper indentation
                indent = len(line) - len(line.lstrip())
                indent_str = ' ' * indent
                
                # Create the fixed version
                fixed_lines.append(f'{indent_str}data = json.dumps({json_content})\n')
                fixed_lines.append(f'{indent_str}yield f"data: {{data}}\\n\\n"\n')
            else:
                # If we can't parse it, keep the original
                fixed_lines.extend(statement_lines)
        else:
            fixed_lines.append(line)
        
        i += 1
    
    # Write the fixed content back
    with open(filename, 'w') as f:
        f.writelines(fixed_lines)
    
    print(f"Fixed {filename}")

if __name__ == "__main__":
    files = [
        'app/api/research_streaming.py',
        'app/api/research_streaming_v2.py'
    ]
    
    for file in files:
        try:
            fix_multiline_fstrings(file)
        except Exception as e:
            print(f"Error fixing {file}: {e}")