#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';

let latestOutput = "";
let terminalOutput = "";
let connectedTurtle = null;
let outputHistory = [];
let pendingFileRead = null;
let pendingDirList = null;

// Create WebSocket server for turtle connections
const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', (ws) => {
  console.error('Turtle connected'); // Use stderr to avoid interfering with MCP protocol
  
  // Close existing connection if there is one
  if (connectedTurtle && connectedTurtle.readyState === ws.OPEN) {
    console.error('Closing existing connection for new turtle');
    connectedTurtle.close();
  }
  
  connectedTurtle = ws;

  ws.on('message', (message) => {
    const messageStr = message.toString();
    console.error('From Turtle:', messageStr);
    
    // Store both raw output and terminal output
    latestOutput += messageStr + '\n';
    
    // Parse different types of messages
    if (messageStr.startsWith('TERMINAL:')) {
      // Terminal output from print statements
      const terminalMsg = messageStr.substring(9); // Remove 'TERMINAL:' prefix
      terminalOutput += terminalMsg + '\n';
      outputHistory.push({ type: 'terminal', content: terminalMsg, timestamp: Date.now() });
    } else if (messageStr.startsWith('SUCCESS:')) {
      // Success messages
      const successMsg = messageStr.substring(8); // Remove 'SUCCESS:' prefix
      outputHistory.push({ type: 'success', content: successMsg, timestamp: Date.now() });
    } else if (messageStr.startsWith('ERROR:')) {
      // Error messages
      const errorMsg = messageStr.substring(6); // Remove 'ERROR:' prefix
      outputHistory.push({ type: 'error', content: errorMsg, timestamp: Date.now() });
    } else if (messageStr.startsWith('FILE_CONTENT:')) {
      // File content response
      const fileContent = messageStr.substring(13); // Remove 'FILE_CONTENT:' prefix
      pendingFileRead = fileContent;
      outputHistory.push({ type: 'file_content', content: fileContent, timestamp: Date.now() });
    } else if (messageStr.startsWith('DIR_LISTING:')) {
      // Directory listing response
      const dirContent = messageStr.substring(12); // Remove 'DIR_LISTING:' prefix
      pendingDirList = dirContent;
      outputHistory.push({ type: 'dir_listing', content: dirContent, timestamp: Date.now() });
    } else {
      // Raw output
      outputHistory.push({ type: 'raw', content: messageStr, timestamp: Date.now() });
    }
    
    // Keep only last 100 messages to prevent memory issues
    if (outputHistory.length > 100) {
      outputHistory = outputHistory.slice(-100);
    }
  });

  ws.on('close', () => {
    console.error('Turtle disconnected');
    connectedTurtle = null;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    connectedTurtle = null;
  });
});

// Clean up connections on server shutdown
process.on('SIGINT', () => {
  console.error('Shutting down MCP server...');
  if (connectedTurtle) {
    connectedTurtle.close();
  }
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down MCP server...');
  if (connectedTurtle) {
    connectedTurtle.close();
  }
  wss.close();
  process.exit(0);
});

// Create MCP server
const server = new Server({
  name: 'computercraft-mcp-bridge',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {}
  },
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'send_turtle_code',
        description: 'Send Lua code to the connected ComputerCraft turtle',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Lua code to send to the turtle'
            }
          },
          required: ['code']
        }
      },
      {
        name: 'get_turtle_output',
        description: 'Get the latest output from the turtle',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_terminal_output',
        description: 'Get the latest terminal output (print statements) from the turtle',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_output_history',
        description: 'Get the complete output history with timestamps and types',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return (default: 20)'
            }
          },
          required: []
        }
      },
      {
        name: 'clear_output',
        description: 'Clear all stored output and history',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_connection_status',
        description: 'Get the current connection status',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'close_connection',
        description: 'Close the current turtle connection',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'create_file',
        description: 'Create a new file on the ComputerCraft device',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Name of the file to create'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'read_file',
        description: 'Read a file from the ComputerCraft device',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Name of the file to read'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'edit_file',
        description: 'Edit/update an existing file on the ComputerCraft device',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Name of the file to edit'
            },
            content: {
              type: 'string',
              description: 'New content for the file'
            }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file from the ComputerCraft device',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Name of the file to delete'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'list_files',
        description: 'List files in a directory on the ComputerCraft device',
        inputSchema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory path to list (default: current directory)'
            }
          },
          required: []
        }
      },
      {
        name: 'get_last_file_content',
        description: 'Get the content of the last file that was read',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_last_directory_listing',
        description: 'Get the last directory listing that was retrieved',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'send_turtle_code') {
    if (connectedTurtle) {
      connectedTurtle.send(args.code);
      return {
        content: [
          {
            type: 'text',
            text: 'Code sent to turtle successfully'
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No turtle connected'
          }
        ],
        isError: true
      };
    }
  } else if (name === 'get_turtle_output') {
    return {
      content: [
        {
          type: 'text',
          text: latestOutput.trim() || 'No output available'
        }
      ]
    };
  } else if (name === 'get_terminal_output') {
    return {
      content: [
        {
          type: 'text',
          text: terminalOutput.trim() || 'No terminal output available'
        }
      ]
    };
  } else if (name === 'get_output_history') {
    const limit = args.limit || 20;
    const recentHistory = outputHistory.slice(-limit);
    
    if (recentHistory.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No output history available'
          }
        ]
      };
    }
    
    const formattedHistory = recentHistory.map(entry => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      return `[${timestamp}] ${entry.type.toUpperCase()}: ${entry.content}`;
    }).join('\n');
    
    return {
      content: [
        {
          type: 'text',
          text: formattedHistory
        }
      ]
    };
  } else if (name === 'clear_output') {
    latestOutput = "";
    terminalOutput = "";
    outputHistory = [];
    
    return {
      content: [
        {
          type: 'text',
          text: 'All output cleared successfully'
        }
      ]
    };
  } else if (name === 'get_connection_status') {
    const isConnected = connectedTurtle && connectedTurtle.readyState === connectedTurtle.OPEN;
    const connectionCount = wss.clients.size;
    
    return {
      content: [
        {
          type: 'text',
          text: `Connection Status:
- Turtle Connected: ${isConnected}
- WebSocket State: ${connectedTurtle ? connectedTurtle.readyState : 'No connection'}
- Total Connections: ${connectionCount}
- Output History: ${outputHistory.length} messages`
        }
      ]
    };
  } else if (name === 'close_connection') {
    if (connectedTurtle) {
      connectedTurtle.close();
      connectedTurtle = null;
      return {
        content: [
          {
            type: 'text',
            text: 'Connection closed successfully'
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'No connection to close'
          }
        ]
      };
    }
  } else if (name === 'create_file') {
    if (!connectedTurtle) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No turtle connected'
          }
        ],
        isError: true
      };
    }

    const luaCode = `
local filename = "${args.filename}"
local content = [=[${args.content}]=]
local file = fs.open(filename, "w")
if file then
  file.write(content)
  file.close()
  print("File created successfully: " .. filename)
else
  error("Failed to create file: " .. filename)
end
return "File created: " .. filename
`;

    connectedTurtle.send(luaCode);
    return {
      content: [
        {
          type: 'text',
          text: `Creating file: ${args.filename}`
        }
      ]
    };
  } else if (name === 'read_file') {
    if (!connectedTurtle) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No turtle connected'
          }
        ],
        isError: true
      };
    }

    // Clear any previous file read
    pendingFileRead = null;
    
    const luaCode = `
local filename = "${args.filename}"
if not fs.exists(filename) then
  print("ERROR:File not found: " .. filename)
  return
end
local file = fs.open(filename, "r")
if file then
  local content = file.readAll()
  file.close()
  print("FILE_CONTENT:" .. content)
  return "File read successfully"
else
  print("ERROR:Failed to read file: " .. filename)
  return
end
`;

    connectedTurtle.send(luaCode);
    
    // Wait for the response by polling
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          content: [
            {
              type: 'text',
              text: 'Timeout: No response from turtle'
            }
          ],
          isError: true
        });
      }, 5000);

      const pollForResult = () => {
        // Check if we have a file content response
        const fileContentEntries = outputHistory.filter(entry => entry.type === 'file_content');
        const errorEntries = outputHistory.filter(entry => entry.type === 'error');
        
        if (fileContentEntries.length > 0) {
          const latestContent = fileContentEntries[fileContentEntries.length - 1];
          if (latestContent.timestamp > Date.now() - 4000) { // Within last 4 seconds
            clearTimeout(timeout);
            resolve({
              content: [
                {
                  type: 'text',
                  text: latestContent.content
                }
              ]
            });
            return;
          }
        }
        
        if (errorEntries.length > 0) {
          const latestError = errorEntries[errorEntries.length - 1];
          if (latestError.timestamp > Date.now() - 4000) { // Within last 4 seconds
            clearTimeout(timeout);
            resolve({
              content: [
                {
                  type: 'text',
                  text: latestError.content
                }
              ],
              isError: true
            });
            return;
          }
        }
        
        // Poll again in 100ms
        setTimeout(pollForResult, 100);
      };
      
      // Start polling after a brief delay
      setTimeout(pollForResult, 100);
    });
  } else if (name === 'edit_file') {
    if (!connectedTurtle) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No turtle connected'
          }
        ],
        isError: true
      };
    }

    const luaCode = `
local filename = "${args.filename}"
local content = [=[${args.content}]=]
local file = fs.open(filename, "w")
if file then
  file.write(content)
  file.close()
  print("File updated successfully: " .. filename)
else
  error("Failed to update file: " .. filename)
end
return "File updated: " .. filename
`;

    connectedTurtle.send(luaCode);
    return {
      content: [
        {
          type: 'text',
          text: `Updating file: ${args.filename}`
        }
      ]
    };
  } else if (name === 'delete_file') {
    if (!connectedTurtle) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No turtle connected'
          }
        ],
        isError: true
      };
    }

    const luaCode = `
local filename = "${args.filename}"
if not fs.exists(filename) then
  error("File not found: " .. filename)
end
fs.delete(filename)
print("File deleted successfully: " .. filename)
return "File deleted: " .. filename
`;

    connectedTurtle.send(luaCode);
    return {
      content: [
        {
          type: 'text',
          text: `Deleting file: ${args.filename}`
        }
      ]
    };
  } else if (name === 'list_files') {
    if (!connectedTurtle) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No turtle connected'
          }
        ],
        isError: true
      };
    }

    const directory = args.directory || '.';
    const luaCode = `
local dir = "${directory}"
if not fs.exists(dir) then
  print("ERROR:Directory not found: " .. dir)
  return
end
if not fs.isDir(dir) then
  print("ERROR:Not a directory: " .. dir)
  return
end

local files = fs.list(dir)
local listing = "Directory: " .. dir .. "\\n"
for _, file in ipairs(files) do
  local fullPath = fs.combine(dir, file)
  if fs.isDir(fullPath) then
    listing = listing .. "[DIR]  " .. file .. "\\n"
  else
    local size = fs.getSize(fullPath)
    listing = listing .. "[FILE] " .. file .. " (" .. size .. " bytes)\\n"
  end
end
print("DIR_LISTING:" .. listing)
return "Directory listing completed"
`;

    connectedTurtle.send(luaCode);
    
    // Wait for the response by polling
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          content: [
            {
              type: 'text',
              text: 'Timeout: No response from turtle'
            }
          ],
          isError: true
        });
      }, 5000);

      const pollForResult = () => {
        // Check if we have a directory listing response
        const dirListingEntries = outputHistory.filter(entry => entry.type === 'dir_listing');
        const errorEntries = outputHistory.filter(entry => entry.type === 'error');
        
        if (dirListingEntries.length > 0) {
          const latestListing = dirListingEntries[dirListingEntries.length - 1];
          if (latestListing.timestamp > Date.now() - 4000) { // Within last 4 seconds
            clearTimeout(timeout);
            resolve({
              content: [
                {
                  type: 'text',
                  text: latestListing.content
                }
              ]
            });
            return;
          }
        }
        
        if (errorEntries.length > 0) {
          const latestError = errorEntries[errorEntries.length - 1];
          if (latestError.timestamp > Date.now() - 4000) { // Within last 4 seconds
            clearTimeout(timeout);
            resolve({
              content: [
                {
                  type: 'text',
                  text: latestError.content
                }
              ],
              isError: true
            });
            return;
          }
        }
        
        // Poll again in 100ms
        setTimeout(pollForResult, 100);
      };
      
      // Start polling after a brief delay
      setTimeout(pollForResult, 100);
    });
  } else if (name === 'get_last_file_content') {
    // Get the most recent file content from output history
    const fileContentEntries = outputHistory.filter(entry => entry.type === 'file_content');
    if (fileContentEntries.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No file content available. Use read_file first to read a file.'
          }
        ]
      };
    }
    
    const latestContent = fileContentEntries[fileContentEntries.length - 1];
    return {
      content: [
        {
          type: 'text',
          text: latestContent.content
        }
      ]
    };
  } else if (name === 'get_last_directory_listing') {
    // Get the most recent directory listing from output history
    const dirListingEntries = outputHistory.filter(entry => entry.type === 'dir_listing');
    if (dirListingEntries.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No directory listing available. Use list_files first to list a directory.'
          }
        ]
      };
    }
    
    const latestListing = dirListingEntries[dirListingEntries.length - 1];
    return {
      content: [
        {
          type: 'text',
          text: latestListing.content
        }
      ]
    };
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'turtle://output',
        name: 'Turtle Output',
        description: 'Latest raw output from the connected turtle',
        mimeType: 'text/plain'
      },
      {
        uri: 'turtle://terminal',
        name: 'Terminal Output',
        description: 'Latest terminal output (print statements) from the turtle',
        mimeType: 'text/plain'
      },
      {
        uri: 'turtle://history',
        name: 'Output History',
        description: 'Complete output history with timestamps and types',
        mimeType: 'text/plain'
      },
      {
        uri: 'turtle://files',
        name: 'File System',
        description: 'ComputerCraft device file system information',
        mimeType: 'text/plain'
      }
    ]
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'turtle://output') {
    return {
      contents: [
        {
          uri: 'turtle://output',
          mimeType: 'text/plain',
          text: latestOutput.trim() || 'No output available'
        }
      ]
    };
  } else if (uri === 'turtle://terminal') {
    return {
      contents: [
        {
          uri: 'turtle://terminal',
          mimeType: 'text/plain',
          text: terminalOutput.trim() || 'No terminal output available'
        }
      ]
    };
  } else if (uri === 'turtle://history') {
    if (outputHistory.length === 0) {
      return {
        contents: [
          {
            uri: 'turtle://history',
            mimeType: 'text/plain',
            text: 'No output history available'
          }
        ]
      };
    }
    
    const formattedHistory = outputHistory.map(entry => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      return `[${timestamp}] ${entry.type.toUpperCase()}: ${entry.content}`;
    }).join('\n');
    
    return {
      contents: [
        {
          uri: 'turtle://history',
          mimeType: 'text/plain',
          text: formattedHistory
        }
      ]
    };
  } else if (uri === 'turtle://files') {
    // Extract file system information from recent output
    const fileOutputs = outputHistory.filter(entry => 
      entry.content.includes('DIRECTORY LISTING') || 
      entry.content.includes('File created') ||
      entry.content.includes('File deleted') ||
      entry.content.includes('File updated')
    );
    
    if (fileOutputs.length === 0) {
      return {
        contents: [
          {
            uri: 'turtle://files',
            mimeType: 'text/plain',
            text: 'No file system information available. Use the list_files tool to populate this resource.'
          }
        ]
      };
    }
    
    const fileInfo = fileOutputs.map(entry => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      return `[${timestamp}] ${entry.content}`;
    }).join('\n');
    
    return {
      contents: [
        {
          uri: 'turtle://files',
          mimeType: 'text/plain',
          text: fileInfo
        }
      ]
    };
  } else {
    throw new Error(`Resource not found: ${uri}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ComputerCraft MCP Bridge server running on stdio (WebSocket on port 3001)');
}

main().catch(console.error);
