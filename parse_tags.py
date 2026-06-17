import re

with open("frontend/app/_components/job-create-form.tsx") as f:
    lines = f.readlines()

def print_tags(start_line, end_line):
    indent = 0
    for i, line in enumerate(lines[start_line:end_line]):
        tags = re.findall(r'<(/?)(div|p|span|label|details|summary|select|option)[^>]*>', line)
        for close, tag in tags:
            if close == "/":
                indent -= 1
                print("  " * indent + f"</{tag}> (line {start_line + i + 1})")
            else:
                print("  " * indent + f"<{tag}> (line {start_line + i + 1})")
                indent += 1

print_tags(430, 740)
