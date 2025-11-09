# Smart Home Device Testing - Multi-Agent Architecture

## Use Case: Automated Functional Testing for Smart Home Devices & Skills

Testing smart home ecosystems (Alexa, Google Home, HomeKit) requires:
- Device simulation (lights, thermostats, locks, cameras)
- Voice command testing
- State validation
- Multi-device scenarios
- Routine/automation testing
- Regression testing

**Challenge**: Manual testing is slow, error-prone, doesn't scale

**Solution**: Multi-Agent System for automated testing

---

## System Architecture (ASCII Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST ORCHESTRATOR AGENT                             │
│  Role: Plan test scenarios, coordinate agents, manage test flow            │
│  Session: test-run-{timestamp}                                             │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
                  │ Creates & coordinates
                  ▼
    ┌─────────────┴─────────────┬──────────────────┬──────────────────┐
    │                           │                  │                  │
    ▼                           ▼                  ▼                  ▼
┌─────────────────┐    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ VOICE COMMAND   │    │ DEVICE AGENTS   │  │ VALIDATION      │  │ REPORTING       │
│ AGENT           │    │ (Multiple)      │  │ AGENT           │  │ AGENT           │
│                 │    │                 │  │                 │  │                 │
│ Simulates:      │    │ Types:          │  │ Checks:         │  │ Generates:      │
│ • Alexa voice   │    │ • Smart Light   │  │ • State changes │  │ • Test reports  │
│ • Google Home   │    │ • Thermostat    │  │ • API responses │  │ • Pass/Fail     │
│ • HomeKit Siri  │    │ • Lock          │  │ • Timing        │  │ • Screenshots   │
│                 │    │ • Camera        │  │ • Error cases   │  │ • Metrics       │
└────────┬────────┘    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                      │                     │                     │
         │                      │                     │                     │
         └──────────────────────┴─────────────────────┴─────────────────────┘
                                          │
                                          │ All agents share session
                                          ▼
                        ┌─────────────────────────────────────┐
                        │   SHARED SESSION CONTEXT            │
                        │   session_id: test-run-{timestamp}  │
                        │                                     │
                        │   • Device states                   │
                        │   • Test progress                   │
                        │   • Voice commands issued           │
                        │   • Validation results              │
                        │   • Error log                       │
                        └─────────────────┬───────────────────┘
                                          │
                                          ▼
                        ┌─────────────────────────────────────┐
                        │   AgentCore Memory (Long-Term)      │
                        │                                     │
                        │   • Known device behaviors          │
                        │   • Common failure patterns         │
                        │   • Regression test history         │
                        │   • Device compatibility matrix     │
                        └─────────────────────────────────────┘
```

---

## Agent Roles & Responsibilities

### 1. **Test Orchestrator Agent**
```yaml
Type: automation
Tools: [calculator, get_current_time]
System Prompt: |
  You are a test orchestrator for smart home device testing.

  Your workflow:
  1. Parse test scenario (YAML/JSON)
  2. Initialize device agents
  3. Execute test steps sequentially
  4. Coordinate between voice command, device, and validation agents
  5. Collect results and generate summary

  Test Flow:
  - Setup: Initialize devices to known state
  - Execute: Run voice commands / API calls
  - Validate: Check expected outcomes
  - Teardown: Reset devices
  - Report: Generate test report
```

**Example Test Scenario:**
```yaml
test_name: "Living Room Light Control"
steps:
  - action: setup
    device: living_room_light
    initial_state: {power: off, brightness: 0}

  - action: voice_command
    platform: alexa
    command: "Alexa, turn on living room light"
    expected_response: "Okay"

  - action: validate
    device: living_room_light
    expected_state: {power: on, brightness: 100}

  - action: voice_command
    platform: alexa
    command: "Alexa, dim living room light to 50%"

  - action: validate
    device: living_room_light
    expected_state: {power: on, brightness: 50}
```

---

### 2. **Voice Command Agent**
```yaml
Type: task_specific
Tools: [send_notification]  # Alerts on command failures
System Prompt: |
  You simulate voice assistant platforms for testing.

  Platforms supported:
  - Amazon Alexa
  - Google Assistant
  - Apple Siri (HomeKit)

  For each command:
  1. Parse natural language command
  2. Extract intent (turn_on, set_brightness, lock, unlock)
  3. Extract entity (device name, room)
  4. Generate platform-specific API call
  5. Return expected response

  Handle variations:
  - "Turn on the lights" vs "Lights on"
  - "Set temperature to 72" vs "Make it 72 degrees"
  - "Lock the front door" vs "Is the door locked?"
```

**API Integration:**
```python
# Voice Command Agent invokes actual platform APIs
alexa_skill_endpoint = "https://api.amazonalexa.com/v1/skills/..."
response = requests.post(alexa_skill_endpoint, json={
    "request": {
        "type": "IntentRequest",
        "intent": {
            "name": "TurnOnIntent",
            "slots": {
                "Device": {"value": "living room light"}
            }
        }
    }
})
```

---

### 3. **Device Simulation Agents** (One per device type)

#### Smart Light Agent
```yaml
Type: persona
Character: Simulates Philips Hue / LIFX smart bulb
Tools: [calculator]  # For brightness calculations
System Prompt: |
  You are a smart light bulb with the following state:
  - power: on/off
  - brightness: 0-100
  - color: RGB(r, g, b)
  - temperature: 2700-6500K

  You respond to commands:
  - turn_on() -> power: on, brightness: 100
  - turn_off() -> power: off
  - set_brightness(value) -> brightness: value
  - set_color(r, g, b) -> color: RGB

  Return JSON state after each command:
  {"power": "on", "brightness": 75, "color": "RGB(255,255,255)"}

  Handle edge cases:
  - Brightness already at max
  - Invalid color values
  - Network timeouts (simulate 5% failure rate)
```

#### Thermostat Agent
```yaml
Type: persona
Character: Simulates Nest / Ecobee thermostat
System Prompt: |
  You are a smart thermostat with state:
  - current_temp: <float>
  - target_temp: <float>
  - mode: heat/cool/auto/off
  - fan: on/auto
  - humidity: <percentage>

  You respond to commands:
  - set_temperature(temp) -> target_temp: temp
  - set_mode(mode) -> mode: mode
  - get_status() -> full state

  Simulate realistic behavior:
  - Temperature changes gradually (1°F per minute)
  - Mode changes require 30 second delay
  - Report error if set temp outside range (50-90°F)
```

#### Smart Lock Agent
```yaml
Type: persona
Character: Simulates August / Yale smart lock
System Prompt: |
  You are a smart door lock with state:
  - locked: true/false
  - battery: 0-100%
  - jammed: true/false

  You respond to commands:
  - lock() -> locked: true (takes 3 seconds)
  - unlock() -> locked: false (takes 3 seconds)
  - get_status() -> state + battery level

  Simulate failures:
  - 2% chance of jam on lock
  - Low battery warning < 20%
  - Network timeout 1%
```

---

### 4. **Validation Agent**
```yaml
Type: automation
Tools: [calculator, get_current_time]
System Prompt: |
  You validate test results with strict criteria.

  Validation types:
  1. State Validation
     - Compare expected vs actual device state
     - Check all fields match

  2. Timing Validation
     - Command execution time < 5 seconds
     - State change propagation < 2 seconds

  3. Response Validation
     - Voice assistant response matches expected
     - API response codes correct (200, 201, etc.)

  4. Error Handling Validation
     - Invalid commands rejected properly
     - Error messages clear and actionable

  Output Format (JSON):
  {
    "test_step": "step_name",
    "status": "PASS|FAIL|ERROR",
    "expected": {...},
    "actual": {...},
    "diff": {...},
    "execution_time_ms": 1234,
    "error_message": null
  }
```

---

### 5. **Reporting Agent**
```yaml
Type: task_specific
Tools: [send_notification]
System Prompt: |
  You generate comprehensive test reports.

  Report sections:
  1. Executive Summary
     - Total tests: X
     - Passed: Y
     - Failed: Z
     - Success rate: Y/X%

  2. Test Details
     - Per-test results
     - Execution times
     - Failure reasons

  3. Device Health
     - Device response times
     - Failure patterns
     - Battery/connectivity issues

  4. Regression Analysis
     - Compare with previous runs
     - New failures identified
     - Fixed issues noted

  5. Recommendations
     - Flaky tests to investigate
     - Devices needing attention
     - Performance improvements

  Output formats:
  - JSON (for CI/CD integration)
  - HTML (for human review)
  - Markdown (for documentation)
```

---

## Data Flow Example

### Test Scenario: "Goodnight Routine"

**Scenario:**
User says "Alexa, goodnight" which should:
1. Turn off all lights
2. Lock front door
3. Set thermostat to 68°F
4. Arm security camera

**Step-by-Step Flow:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Test Orchestrator receives test scenario                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Initialize device agents with known states                         │
│                                                                             │
│  Living Room Light Agent  -> {power: on, brightness: 100}                  │
│  Bedroom Light Agent      -> {power: on, brightness: 50}                   │
│  Front Door Lock Agent    -> {locked: false}                               │
│  Thermostat Agent         -> {temp: 72, mode: cool}                        │
│  Camera Agent             -> {armed: false}                                │
│                                                                             │
│  session_id: test-goodnight-routine-2025-01-08-20-30                       │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Orchestrator -> Voice Command Agent                                │
│                                                                             │
│  "Execute voice command: Alexa, goodnight"                                 │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 4: Voice Command Agent parses routine                                 │
│                                                                             │
│  Intent: ActivateRoutine                                                   │
│  Routine: Goodnight                                                        │
│  Actions:                                                                  │
│    - TurnOffIntent(all_lights)                                            │
│    - LockIntent(front_door)                                               │
│    - SetTemperatureIntent(68)                                             │
│    - ArmIntent(camera)                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 5: Send commands to device agents (in session)                        │
│                                                                             │
│  Orchestrator -> Living Room Light: "Turn off"                             │
│    Light Agent: {power: off, brightness: 0} ✓                             │
│                                                                             │
│  Orchestrator -> Bedroom Light: "Turn off"                                 │
│    Light Agent: {power: off, brightness: 0} ✓                             │
│                                                                             │
│  Orchestrator -> Front Door Lock: "Lock"                                   │
│    Lock Agent: {locked: true} ✓                                           │
│                                                                             │
│  Orchestrator -> Thermostat: "Set to 68°F"                                │
│    Thermostat Agent: {target: 68, mode: cool} ✓                           │
│                                                                             │
│  Orchestrator -> Camera: "Arm"                                             │
│    Camera Agent: {armed: true, recording: true} ✓                         │
│                                                                             │
│  All agents store state in session: test-goodnight-routine-...            │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 6: Validation Agent checks results                                    │
│                                                                             │
│  Expected vs Actual:                                                       │
│    Living Room Light: {power: off} == {power: off} ✓ PASS                │
│    Bedroom Light: {power: off} == {power: off} ✓ PASS                    │
│    Front Door: {locked: true} == {locked: true} ✓ PASS                   │
│    Thermostat: {target: 68} == {target: 68} ✓ PASS                       │
│    Camera: {armed: true} == {armed: true} ✓ PASS                         │
│                                                                             │
│  Timing:                                                                   │
│    Total execution: 4.2s < 5s threshold ✓ PASS                            │
│                                                                             │
│  Result: 5/5 checks passed                                                │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 7: Reporting Agent generates report                                   │
│                                                                             │
│  Test: Goodnight Routine                                                   │
│  Status: PASSED ✓                                                          │
│  Duration: 4.2s                                                            │
│  Devices tested: 5                                                         │
│  Success rate: 100%                                                        │
│                                                                             │
│  Stored in:                                                                │
│  - Session history (FileSessionManager)                                    │
│  - AgentCore Memory (regression tracking)                                  │
│  - Test database (CI/CD integration)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Session Management in Testing

### Session Strategy

```python
# Test Run Session
session_id = f"test-{test_name}-{timestamp}"
# Example: "test-goodnight-routine-2025-01-08-20-30-45"

# All agents in this test share the session_id
# Benefits:
# 1. Agents can reference each other's actions
# 2. Full test context preserved
# 3. Can debug by reviewing session history
# 4. Replay tests by re-running session
```

### Multi-Session Testing

```python
# Regression Test Suite = Multiple Sessions
test_suite_sessions = [
    "test-goodnight-routine-...",
    "test-morning-routine-...",
    "test-vacation-mode-...",
    "test-security-alarm-..."
]

# Each test = independent session
# Cross-test analysis via AgentCore Memory
```

---

## Tools Integration for Real Device Testing

### Gateway Tools (via AgentCore Gateway)

```yaml
Gateway Tools:
  - name: alexa_skill_api
    type: openapi
    spec: alexa_skill_api_spec.json

  - name: google_home_api
    type: openapi
    spec: google_home_api_spec.json

  - name: philips_hue_api
    type: lambda
    function_arn: arn:aws:lambda:...:hue-control

  - name: nest_api
    type: lambda
    function_arn: arn:aws:lambda:...:nest-control

  - name: august_lock_api
    type: lambda
    function_arn: arn:aws:lambda:...:august-lock
```

### Agent Tool Configuration

```python
# Orchestrator Agent
{
  "tools": ["calculator", "get_current_time"],
  "gateway_id": "test-gateway-uuid"
}

# Voice Command Agent
{
  "tools": ["alexa_skill_api", "google_home_api"],
  "gateway_id": "test-gateway-uuid"
}

# Device Agents
{
  "tools": ["philips_hue_api", "nest_api", "august_lock_api"],
  "gateway_id": "test-gateway-uuid"
}
```

---

## Memory Usage

### Short-Term (FileSessionManager)
- **Scope**: This test run
- **Stores**:
  - Device states at each step
  - Commands issued
  - Validation results
  - Execution times
- **Purpose**: Test replay, debugging

### Long-Term (AgentCore Memory)
- **Scope**: All test runs
- **Stores**:
  - Known device behaviors
  - Common failure patterns
  - Performance baselines
  - Regression history
- **Purpose**: Trend analysis, ML for predictive failures

---

## API Workflow

### 1. Create Orchestrator Agent
```bash
curl -X POST http://localhost:8080/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Smart Home Test Orchestrator",
    "agent_type": "automation",
    "system_prompt": "You orchestrate smart home device testing...",
    "tools": ["calculator", "get_current_time"],
    "memory_type": "both"
  }'
```

### 2. Create Device Agents
```bash
# Smart Light Agent
curl -X POST http://localhost:8080/api/v1/agents \
  -d '{
    "name": "Living Room Light Simulator",
    "agent_type": "persona",
    "character": "Philips Hue smart bulb",
    "system_prompt": "You simulate a smart light...",
    "tools": ["calculator"]
  }'

# Repeat for thermostat, lock, camera, etc.
```

### 3. Create Validation Agent
```bash
curl -X POST http://localhost:8080/api/v1/agents \
  -d '{
    "name": "Test Validator",
    "agent_type": "automation",
    "system_prompt": "You validate test results...",
    "tools": ["calculator", "get_current_time"]
  }'
```

### 4. Run Test (Single Session)
```bash
# Start test session
SESSION_ID="test-goodnight-$(date +%s)"

# Orchestrator initializes test
curl -X POST http://localhost:8080/api/v1/agents/$ORCHESTRATOR_ID/invoke \
  -d "{
    \"prompt\": \"Run test: goodnight routine\",
    \"session_id\": \"$SESSION_ID\",
    \"actor_id\": \"test-runner\"
  }"

# Orchestrator sends commands to device agents (same session!)
curl -X POST http://localhost:8080/api/v1/agents/$LIGHT_AGENT_ID/invoke \
  -d "{
    \"prompt\": \"Turn off\",
    \"session_id\": \"$SESSION_ID\",  # Same session
    \"actor_id\": \"test-runner\"
  }"

# Validation agent checks (same session!)
curl -X POST http://localhost:8080/api/v1/agents/$VALIDATOR_ID/invoke \
  -d "{
    \"prompt\": \"Validate living room light is off\",
    \"session_id\": \"$SESSION_ID\",  # Same session
    \"actor_id\": \"test-runner\"
  }"

# All agents share context via session_id!
```

### 5. Generate Report
```bash
curl -X POST http://localhost:8080/api/v1/agents/$REPORTING_ID/invoke \
  -d "{
    \"prompt\": \"Generate test report for session $SESSION_ID\",
    \"session_id\": \"$SESSION_ID\",
    \"actor_id\": \"test-runner\"
  }"
```

---

## Advanced Scenarios

### Scenario 1: Multi-Device Synchronization Test
```yaml
test: "Lights sync with music"
devices:
  - living_room_light
  - bedroom_light
  - kitchen_light
  - music_player

scenario:
  - Play music with beat detection
  - All lights should pulse in sync
  - Validation: Check timing within 50ms tolerance
```

### Scenario 2: Failure Recovery Test
```yaml
test: "Network timeout recovery"
devices:
  - smart_lock

scenario:
  - Simulate network timeout during lock command
  - Check retry mechanism activates
  - Validate lock eventually succeeds
  - Check error notification sent
```

### Scenario 3: Battery Low Handling
```yaml
test: "Low battery warnings"
devices:
  - smart_lock (battery: 15%)
  - smoke_detector (battery: 10%)

scenario:
  - Trigger low battery threshold
  - Validate warning notifications
  - Check degraded functionality
  - Verify critical functions still work
```

---

## CI/CD Integration

```yaml
# .github/workflows/smart-home-tests.yml
name: Smart Home Device Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run Goodnight Routine Test
        run: |
          SESSION_ID="ci-goodnight-$(date +%s)"

          # Run test via API
          RESULT=$(curl -X POST $API_URL/agents/$ORCHESTRATOR_ID/invoke \
            -d "{\"prompt\": \"Run goodnight routine test\", \"session_id\": \"$SESSION_ID\"}")

          # Check result
          STATUS=$(echo $RESULT | jq -r '.metadata.test_status')

          if [ "$STATUS" != "PASS" ]; then
            echo "Test failed!"
            exit 1
          fi
```

---

## Benefits of This Architecture

1. **Scalability**
   - Add new device types = create new agent
   - Add new platforms (HomeKit) = configure voice agent
   - Parallel test execution across sessions

2. **Maintainability**
   - Each agent has single responsibility
   - Update device behavior in one place
   - Test scenarios in YAML (no code changes)

3. **Reusability**
   - Device agents reused across tests
   - Validation logic centralized
   - Reporting standardized

4. **Debuggability**
   - Session history shows full conversation
   - Step-by-step state changes logged
   - Easy to replay failed tests

5. **Intelligence**
   - Agents learn from failures (AgentCore Memory)
   - Predict flaky tests
   - Suggest test improvements
   - Auto-generate test cases from user behavior

---

## Next Steps

1. **Create agent configurations** (see `examples/agent_configs.py`)
2. **Define test scenarios** (YAML format)
3. **Set up gateway** with device API tools
4. **Run pilot test** with 2-3 devices
5. **Integrate with CI/CD**
6. **Scale to full device suite**

The infrastructure is ready - just configure the agents for your specific devices!
