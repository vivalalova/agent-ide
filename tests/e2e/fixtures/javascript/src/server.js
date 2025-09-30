/**
 * Server creation and configuration
 */

export function createServer(options) {
  const { controllers, config, database } = options;

  // Mock server implementation for testing
  return {
    listen(port, callback) {
      if (callback) callback();
      return {
        close(callback) {
          if (callback) callback();
        }
      };
    }
  };
}