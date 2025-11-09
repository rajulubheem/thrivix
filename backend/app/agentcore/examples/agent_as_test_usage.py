"""
AgentAsTest Usage Examples

Real-world examples of how QA engineers use the AgentAsTest framework.
"""

import uuid
from datetime import datetime


# ===========================================================================
# Example 1: E-Commerce Checkout Testing
# ===========================================================================

def test_checkout_flow():
    """
    Complete E2E checkout test using multiple coordinated agents.

    This demonstrates how agents share context via session_id.
    """

    # 1. Generate unique test session
    test_session = f"test-checkout-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    print(f"Starting test session: {test_session}")

    # 2. Test Orchestrator creates execution plan
    orchestrator_request = {
        "agent_id": "test-orchestrator-id",
        "session_id": test_session,
        "actor_id": "qa-engineer-001",
        "prompt": """
        Test e-commerce checkout flow end-to-end:
        - Create test user with payment method
        - Add products to cart
        - Complete checkout process
        - Validate order created across all systems
        - Test edge cases (expired card, out of stock)
        """
    }

    # Orchestrator response (example):
    orchestrator_plan = {
        "test_plan": {
            "session_id": test_session,
            "phases": [
                {
                    "phase": "setup",
                    "agents": [
                        {
                            "agent": "data_generator",
                            "task": "create_test_user",
                            "output_vars": ["user_id", "email", "password"]
                        },
                        {
                            "agent": "data_generator",
                            "task": "create_test_products",
                            "output_vars": ["product_ids"]
                        }
                    ]
                },
                {
                    "phase": "execution",
                    "parallel": True,
                    "agents": [
                        {
                            "agent": "api_tester",
                            "task": "validate_cart_api",
                            "tests": ["add_item", "remove_item", "get_cart"]
                        },
                        {
                            "agent": "ui_tester",
                            "task": "test_checkout_ui",
                            "steps": [
                                "login with test user",
                                "add products to cart",
                                "proceed to checkout",
                                "enter payment details",
                                "complete order"
                            ]
                        }
                    ]
                },
                {
                    "phase": "validation",
                    "agents": [
                        {
                            "agent": "assertion_validator",
                            "task": "validate_order_created",
                            "checks": [
                                "order exists in database",
                                "inventory decremented",
                                "email confirmation sent",
                                "payment processed"
                            ]
                        }
                    ]
                },
                {
                    "phase": "edge_cases",
                    "agents": [
                        {
                            "agent": "ui_tester",
                            "task": "test_expired_card",
                            "expected": "error_message_displayed"
                        },
                        {
                            "agent": "api_tester",
                            "task": "test_duplicate_order",
                            "expected": "idempotency_maintained"
                        }
                    ]
                },
                {
                    "phase": "teardown",
                    "agents": [
                        {
                            "agent": "data_generator",
                            "task": "cleanup_test_data",
                            "scope": test_session
                        }
                    ]
                }
            ]
        }
    }

    # 3. Execute each phase

    # SETUP: Data Generator creates test data
    data_gen_request = {
        "agent_id": "data-generator-id",
        "session_id": test_session,  # SAME SESSION!
        "actor_id": "qa-engineer-001",
        "prompt": "Create test user with valid payment method and 3 products"
    }

    # Data Generator stores in session context:
    # - user_id: "test-user-abc123"
    # - email: "john.doe.test@example.com"
    # - password: "TestPass123!"
    # - product_ids: ["prod-1", "prod-2", "prod-3"]


    # EXECUTION: UI Agent uses the test data
    ui_test_request = {
        "agent_id": "ui-tester-id",
        "session_id": test_session,  # SAME SESSION!
        "actor_id": "qa-engineer-001",
        "prompt": """
        Complete checkout flow:
        1. Login with test user
        2. Add all test products to cart
        3. Proceed to checkout
        4. Complete payment
        """
    }

    # UI Agent automatically retrieves from session:
    # - email and password for login
    # - product_ids to add to cart
    # No manual parameter passing needed!


    # VALIDATION: Assertion Agent validates
    assertion_request = {
        "agent_id": "assertion-validator-id",
        "session_id": test_session,  # SAME SESSION!
        "actor_id": "qa-engineer-001",
        "prompt": "Validate order created successfully for test user across all systems"
    }

    # Assertion Agent knows:
    # - Which user placed the order
    # - Which products should be in the order
    # - All from shared session context!


    # REPORTING: Reporter summarizes
    reporter_request = {
        "agent_id": "test-reporter-id",
        "session_id": test_session,  # SAME SESSION!
        "actor_id": "qa-engineer-001",
        "prompt": "Generate comprehensive test report for this session"
    }

    # Reporter has access to:
    # - All test steps executed
    # - All validation results
    # - Performance metrics
    # - Failure details if any

    return {
        "session_id": test_session,
        "status": "completed",
        "summary": "All agents coordinated via shared session_id"
    }


# ===========================================================================
# Example 2: API Contract Testing
# ===========================================================================

def test_api_contracts():
    """
    Validate API contracts between microservices.

    Tests backward compatibility and schema compliance.
    """

    test_session = f"test-api-contracts-{uuid.uuid4().hex[:8]}"

    # Single agent handles entire contract validation
    api_test_request = {
        "agent_id": "api-tester-id",
        "session_id": test_session,
        "actor_id": "qa-engineer-002",
        "prompt": """
        Validate API contracts for Order Service:

        1. Read OpenAPI spec from /api/docs
        2. Test all endpoints with valid payloads
        3. Test edge cases (missing fields, invalid types)
        4. Validate response schemas
        5. Test error scenarios (404, 500, timeout)
        6. Check backward compatibility with v1 API

        Endpoints:
        - POST /api/orders (create order)
        - GET /api/orders/{id} (get order)
        - PUT /api/orders/{id} (update order)
        - DELETE /api/orders/{id} (cancel order)

        Generate test data automatically for all scenarios.
        """
    }

    # API Agent automatically:
    # - Reads OpenAPI specification
    # - Generates valid test payloads
    # - Tests happy paths
    # - Generates edge case payloads
    # - Validates all responses
    # - Reports schema violations

    return {
        "session_id": test_session,
        "test_type": "api_contract_validation"
    }


# ===========================================================================
# Example 3: Performance Regression Testing
# ===========================================================================

def test_performance_regression():
    """
    Load test critical endpoints and detect regressions.
    """

    test_session = f"test-perf-{uuid.uuid4().hex[:8]}"

    perf_test_request = {
        "agent_id": "performance-tester-id",
        "session_id": test_session,
        "actor_id": "qa-engineer-003",
        "prompt": """
        Performance test for checkout API:

        Load Profile:
        - Duration: 10 minutes
        - Concurrent users: 1000
        - Ramp-up: 2 minutes

        Endpoints:
        - GET /api/cart (60% of traffic)
        - POST /api/cart/items (30% of traffic)
        - POST /api/checkout (10% of traffic)

        Success Criteria:
        - P95 response time < 500ms
        - Error rate < 0.1%
        - Throughput > 1000 req/sec

        Compare results to baseline from last week.
        Flag any regressions.
        """
    }

    # Performance Agent:
    # - Generates K6/JMeter test script
    # - Executes load test
    # - Monitors response times, errors, throughput
    # - Compares to baseline metrics from memory
    # - Identifies bottlenecks (slow queries, memory leaks)
    # - Reports regressions with recommendations

    return {
        "session_id": test_session,
        "test_type": "performance_load_test"
    }


# ===========================================================================
# Example 4: Self-Healing UI Test
# ===========================================================================

def test_self_healing_ui():
    """
    Demonstrate UI test that adapts to changes automatically.
    """

    test_session = f"test-ui-{uuid.uuid4().hex[:8]}"

    # Traditional brittle test (for comparison):
    traditional_test = """
    # This breaks when UI changes:
    driver.find_element_by_id("email-input").send_keys("test@example.com")
    driver.find_element_by_id("password-input").send_keys("password123")
    driver.find_element_by_css_selector("button.login-submit").click()
    """

    # Agent-based self-healing test:
    ui_test_request = {
        "agent_id": "ui-tester-id",
        "session_id": test_session,
        "actor_id": "qa-engineer-004",
        "prompt": "Login with email 'test@example.com' and password 'password123'"
    }

    # UI Agent:
    # - Understands intent: "login with credentials"
    # - Finds email input by:
    #   * Label: "Email" or "Email Address"
    #   * Placeholder: "Enter your email"
    #   * Type: input[type="email"]
    #   * Aria-label: "email-input"
    #   * Visual context: Near "Login" heading
    #
    # - Finds password input similarly
    # - Finds submit button by:
    #   * Text: "Login", "Sign In", "Submit"
    #   * Type: button[type="submit"]
    #   * Visual context: Inside login form
    #
    # - If selectors changed since last run:
    #   * Adapts to new structure
    #   * Logs adaptation for QA review
    #   * Updates selector strategy
    #
    # - Validates success:
    #   * URL changed to /dashboard
    #   * User menu appeared
    #   * Login form disappeared

    return {
        "session_id": test_session,
        "test_type": "self_healing_ui_test",
        "advantage": "No maintenance when UI changes"
    }


# ===========================================================================
# Example 5: Bug Root Cause Analysis
# ===========================================================================

def analyze_test_failure():
    """
    When a test fails, Bug Detective investigates automatically.
    """

    test_session = f"test-debug-{uuid.uuid4().hex[:8]}"

    # Scenario: Checkout test failed
    failed_test_context = {
        "test_name": "checkout_flow",
        "session_id": test_session,
        "failure": "Checkout button click had no effect",
        "screenshot": "checkout_page_failed.png",
        "logs": """
        [ERROR] Element not clickable: <button disabled="true">
        [INFO] Cart total: $0.00
        [WARN] Business rule: Cannot checkout with $0 cart
        """
    }

    # Bug Detective analyzes
    detective_request = {
        "agent_id": "bug-detective-id",
        "session_id": test_session,
        "actor_id": "qa-engineer-005",
        "prompt": f"""
        Analyze test failure:

        Test: {failed_test_context['test_name']}
        Failure: {failed_test_context['failure']}
        Logs: {failed_test_context['logs']}

        Find root cause and suggest fix.
        """
    }

    # Bug Detective Response (example):
    detective_analysis = {
        "root_cause": "Invalid test data",
        "details": """
        Analysis:
        1. Screenshot shows checkout button is disabled
        2. DOM confirms: <button disabled="true">
        3. Console shows: "Cart total cannot be $0"
        4. Traced back to: Data Generator created products with price=0

        Root Cause:
        - Data Generator didn't enforce constraint: price > 0
        - Business logic correctly prevents $0 checkout
        - Button correctly disabled (not a bug)

        Category: Test Issue (not application bug)
        Severity: Low
        """,
        "recommendations": [
            "Update Data Generator: Add constraint price > 0",
            "Add validation: All generated data meets business rules",
            "Improve test: Validate data before running test flow"
        ],
        "similar_issues": [
            "test-20250105: Product with negative inventory",
            "test-20250103: User with invalid email format"
        ]
    }

    return detective_analysis


# ===========================================================================
# Example 6: Natural Language Test Definition
# ===========================================================================

def natural_language_test():
    """
    QA writes test in plain English, agents execute.
    """

    test_session = f"test-nl-{uuid.uuid4().hex[:8]}"

    # QA Engineer writes test in natural language:
    test_definition = """
    Test: User Registration Flow

    Scenario: New user signs up successfully

    Steps:
    1. Navigate to registration page
    2. Enter valid email and strong password
    3. Accept terms and conditions
    4. Submit registration form

    Validations:
    - User account created in database
    - Confirmation email sent
    - User can login with credentials
    - User redirected to onboarding

    Edge Cases to Test:
    - Weak password (should show error)
    - Duplicate email (should show "email already exists")
    - Missing required fields (should show validation)
    - Invalid email format (should show error)
    """

    # Test Orchestrator parses and creates execution plan
    orchestrator_request = {
        "agent_id": "test-orchestrator-id",
        "session_id": test_session,
        "actor_id": "qa-engineer-006",
        "prompt": test_definition
    }

    # Orchestrator automatically:
    # 1. Identifies agents needed: UI Tester, Data Generator, Assertion Validator
    # 2. Plans test steps
    # 3. Generates edge cases
    # 4. Coordinates execution
    # 5. No code writing needed!

    execution_plan = {
        "test_id": "user_registration",
        "session_id": test_session,
        "agents": ["data_generator", "ui_tester", "assertion_validator"],
        "test_cases": [
            {
                "name": "happy_path",
                "steps": [
                    "data_generator: Create valid email and password",
                    "ui_tester: Navigate to /register",
                    "ui_tester: Fill registration form",
                    "ui_tester: Submit form",
                    "assertion_validator: Check user in database",
                    "assertion_validator: Verify email sent",
                    "ui_tester: Login with credentials",
                    "assertion_validator: Confirm redirect to /onboarding"
                ]
            },
            {
                "name": "weak_password",
                "steps": [
                    "data_generator: Create email and weak password '123'",
                    "ui_tester: Fill form with weak password",
                    "ui_tester: Submit form",
                    "assertion_validator: Error message displayed"
                ]
            },
            {
                "name": "duplicate_email",
                "steps": [
                    "data_generator: Create user in database",
                    "ui_tester: Try to register with same email",
                    "assertion_validator: 'Email already exists' error shown"
                ]
            }
        ]
    }

    return {
        "session_id": test_session,
        "test_type": "natural_language_test",
        "advantage": "No code writing, just describe what to test"
    }


# ===========================================================================
# API Usage Example
# ===========================================================================

def api_usage_example():
    """
    How to use AgentAsTest via REST API.
    """

    import requests

    base_url = "http://localhost:8080/api/v1"

    # 1. Create Test Orchestrator Agent
    create_orchestrator = requests.post(
        f"{base_url}/agents/examples/test_orchestrator"
    )
    orchestrator_id = create_orchestrator.json()["agent_id"]

    # 2. Create supporting agents
    agents = {}
    for agent_type in ["ui_tester", "api_tester", "data_generator", "test_reporter"]:
        response = requests.post(f"{base_url}/agents/examples/{agent_type}")
        agents[agent_type] = response.json()["agent_id"]

    # 3. Start test run
    test_session = f"test-{uuid.uuid4().hex[:8]}"

    test_request = {
        "prompt": "Test checkout flow end-to-end with edge cases",
        "session_id": test_session,
        "actor_id": "qa-engineer-001"
    }

    # 4. Invoke orchestrator
    response = requests.post(
        f"{base_url}/agents/{orchestrator_id}/invoke",
        json=test_request
    )

    test_plan = response.json()["response"]

    # 5. Execute each agent in the plan (simplified)
    # In reality, orchestrator would do this automatically

    # 6. Get test results
    reporter_request = {
        "prompt": "Generate test report for this session",
        "session_id": test_session,
        "actor_id": "qa-engineer-001"
    }

    report_response = requests.post(
        f"{base_url}/agents/{agents['test_reporter']}/invoke",
        json=reporter_request
    )

    test_report = report_response.json()["response"]

    return {
        "session_id": test_session,
        "report": test_report
    }


# ===========================================================================
# Main
# ===========================================================================

if __name__ == "__main__":
    print("=== AgentAsTest Usage Examples ===\n")

    examples = [
        ("E-Commerce Checkout Test", test_checkout_flow),
        ("API Contract Validation", test_api_contracts),
        ("Performance Regression Test", test_performance_regression),
        ("Self-Healing UI Test", test_self_healing_ui),
        ("Bug Root Cause Analysis", analyze_test_failure),
        ("Natural Language Test", natural_language_test),
    ]

    for name, example_func in examples:
        print(f"\n--- {name} ---")
        result = example_func()
        print(f"Session ID: {result.get('session_id', 'N/A')}")
        print(f"Type: {result.get('test_type', 'multi_agent_test')}")
        if 'advantage' in result:
            print(f"Advantage: {result['advantage']}")
