# Write Tests

Generate comprehensive tests for the specified code: $ARGUMENTS

## Test Categories

1. **Happy Path** - Normal operation with valid inputs
2. **Error Cases** - Invalid inputs, missing resources, permission issues
3. **Edge Cases** - Empty files, large files, partial chunks, concurrent access
4. **Security Cases** - Path traversal, absolute paths, boundary conditions

## Patterns

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_scenario_expected() {
        // Arrange, Act, Assert
    }
}
```

### Async Tests
```rust
#[tokio::test]
async fn test_async_operation() {
    let result = async_function().await;
    assert!(result.is_ok());
}
```

### FUSE Mocks
```rust
struct MockVfs {
    files: HashMap<String, Vec<u8>>,
}
```

## Output

Generate tests covering:
- 2+ happy path tests
- 2+ error case tests
- 2+ edge case tests
- Descriptive names: `test_[function]_[scenario]_[expected]`
