#!/usr/bin/env python3
"""Fix all problematic f-strings in research files"""

import re
import os

def fix_nested_fstrings_in_file(filepath):
    """Fix nested f-strings in a file"""
    
    if not os.path.exists(filepath):
        print(f"File {filepath} not found")
        return
    
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    fixed_lines = []
    changes_made = 0
    
    for i, line in enumerate(lines):
        # Check if this line has a yield with json.dumps containing nested f-strings
        if 'yield f"data: {json.dumps(' in line and "f'" in line:
            # Extract the json.dumps content
            match = re.search(r'yield f"data: \{(json\.dumps\([^)]+\))\}\\n\\n"', line)
            if match:
                json_part = match.group(1)
                indent = len(line) - len(line.lstrip())
                indent_str = ' ' * indent
                
                # Create a variable assignment before the yield
                fixed_lines.append(f'{indent_str}data = {json_part}\n')
                fixed_lines.append(f'{indent_str}yield f"data: {{data}}\\n\\n"\n')
                changes_made += 1
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    if changes_made > 0:
        with open(filepath, 'w') as f:
            f.writelines(fixed_lines)
        print(f"Fixed {changes_made} nested f-strings in {filepath}")
    else:
        print(f"No changes needed in {filepath}")

# Fix all research streaming files
files = [
    'app/api/research_streaming_realtime.py',
    'app/api/research_polling.py',
    'app/api/research_polling_enhanced.py',
    'app/api/research_polling_real.py'
]

for filepath in files:
    fix_nested_fstrings_in_file(filepath)