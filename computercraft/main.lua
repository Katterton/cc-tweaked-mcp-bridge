-- ComputerCraft MCP Bridge
-- This script runs on the ComputerCraft turtle/computer to connect to the MCP server

local ws = http.websocket("ws://localhost:3001")

if not ws then
  print("Failed to connect to MCP bridge")
  return
end

print("Connected to MCP bridge!")

-- Custom print function that prefixes with TERMINAL:
local originalPrint = print
function mcpPrint(...)
  local args = {...}
  local message = ""
  for i, arg in ipairs(args) do
    if i > 1 then message = message .. "\t" end
    message = message .. tostring(arg)
  end
  
  -- Check if message starts with special prefixes
  if message:find("^FILE_CONTENT:") or message:find("^DIR_LISTING:") or message:find("^ERROR:") or message:find("^SUCCESS:") then
    -- Send raw message without TERMINAL: prefix
    ws.send(message)
  else
    -- Send with TERMINAL: prefix
    ws.send("TERMINAL:" .. message)
  end
end

-- Override the global print function
print = mcpPrint

print("MCP Bridge is ready!")
print("You can now send Lua code from VS Code")

-- Main loop
while true do
  local message = ws.receive()
  if message then
    print("Executing code: " .. message)
    
    -- Create a new environment for the code
    local codeEnv = {}
    setmetatable(codeEnv, {__index = _G})
    codeEnv.print = mcpPrint
    
    -- Load and execute the code
    local func, err = load(message, "received_code", "t", codeEnv)
    if func then
      local success, result = pcall(func)
      if success then
        if result then
          print("Result:\t" .. tostring(result))
        end
      else
        print("Error:\t" .. tostring(result))
      end
    else
      print("Parse error:\t" .. tostring(err))
    end
  else
    -- Connection closed
    break
  end
end

ws.close()
print("MCP Bridge disconnected")
