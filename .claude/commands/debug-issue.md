# Debug Issue

Systematically debug the issue: $ARGUMENTS

## Debug Process

1. **Reproduce** - Confirm the issue exists
2. **Isolate** - Find the smallest failing case
3. **Trace** - Follow the code path
4. **Identify** - Find root cause
5. **Fix** - Apply minimal change
6. **Verify** - Confirm fix works

## Common Issues

### FUSE Errors
- `ENOENT` - File not found, check path resolution
- `EIO` - I/O error, check QUIC connection
- `EACCES` - Permission denied, check share mode

### QUIC Issues
- Connection timeout - Check signal server
- Stream reset - Check message framing
- Certificate errors - Check rustls config

### Async Issues
- Deadlock - Check lock ordering
- Timeout - Check await points
- Panic - Check unwrap() calls

## Output

Provide:
- Root cause analysis
- Minimal fix with explanation
- Test to prevent regression
