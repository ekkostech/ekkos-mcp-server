# Changelog

All notable changes to the ekkOS Memory MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2025-12-13

### Added

- **Resources Capability Support**: Added resources capability to MCP server initialization for better compatibility with Windsurf and other MCP clients
- **Resources List Handler**: Implemented `resources/list` handler that returns empty array (ekkOS uses tools, not resources)

### Changed

- **Server Version**: Updated to 1.2.3 to match package version

### Fixed

- **Windsurf Compatibility**: Windsurf can now properly discover the MCP server without errors about missing resources support

## [1.1.0] - 2025-12-07

### Added

- **Fallback Mechanism**: Direct Supabase queries when unified-context API fails
- **Improved Error Handling**: Better resilience for API connection issues
- **Enhanced Logging**: More detailed error messages and debugging output

### Changed

- **API Integration**: Now uses unified-context API as primary path
- **Response Format**: Improved transformation of unified-context responses to MCP format
- **Tool Reliability**: Better handling of partial failures

### Fixed

- **Connection Issues**: Fallback ensures tools remain functional even if API is down
- **Error Propagation**: Better error messages for debugging

## [1.0.0] - 2025-12-05

### Added

- Initial release of ekkOS Memory MCP Server
- MCP Protocol 2025-06-18 support
- Tools:
  - `search_memory` - Query all memory layers
  - `get_context` - Get unified context
  - `capture_event` - Store learning episodes
  - `forge_pattern` - Create new patterns
  - `track_application` - Track pattern usage
  - `record_outcome` - Record pattern outcomes
  - `get_memory_stats` - Get system statistics
- HTTP/SSE transport support
- Cloud deployment support

---

## Version History

- `1.1.0` - Improved reliability with fallback mechanisms
- `1.0.0` - Initial release


