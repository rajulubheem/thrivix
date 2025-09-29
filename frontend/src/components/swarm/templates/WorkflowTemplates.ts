// Workflow Templates for AI Services and Device Integration
// These templates demonstrate various complexity levels for real-world applications

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'simple' | 'medium' | 'complex';
  tags: string[];
  machine: {
    name: string;
    initial_state: string;
    states: any[];
    edges: any[];
  };
}

export const workflowTemplates: WorkflowTemplate[] = [
  // ============== SIMPLE TEMPLATES ==============
  {
    id: 'voice-skill-basic',
    name: 'Voice Assistant Skill',
    description: 'Basic voice command processing workflow for smart speakers',
    category: 'simple',
    tags: ['voice', 'assistant', 'smart-speaker'],
    machine: {
      name: 'Voice Skill Workflow',
      initial_state: 'receive_intent',
      states: [
        {
          id: 'receive_intent',
          name: 'Receive Voice Intent',
          type: 'analysis',
          description: 'Parse and understand user voice command',
          agent_role: 'Intent Parser',
          tools: ['intent_classifier'],
          transitions: { success: 'process_request' }
        },
        {
          id: 'process_request',
          name: 'Process Request',
          type: 'tool_call',
          description: 'Execute the requested action',
          agent_role: 'Request Handler',
          tools: ['api_gateway', 'database_query'],
          transitions: { success: 'generate_response', failure: 'error_handler' }
        },
        {
          id: 'generate_response',
          name: 'Generate Voice Response',
          type: 'transformation',
          description: 'Create natural language response',
          agent_role: 'Response Generator',
          tools: ['text_to_speech'],
          transitions: { success: 'complete' }
        },
        {
          id: 'error_handler',
          name: 'Handle Error',
          type: 'analysis',
          description: 'Process errors and generate fallback response',
          transitions: { success: 'generate_response' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Return voice response to user'
        }
      ],
      edges: [
        { source: 'receive_intent', target: 'process_request', event: 'success' },
        { source: 'process_request', target: 'generate_response', event: 'success' },
        { source: 'process_request', target: 'error_handler', event: 'failure' },
        { source: 'error_handler', target: 'generate_response', event: 'success' },
        { source: 'generate_response', target: 'complete', event: 'success' }
      ]
    }
  },

  {
    id: 'image-analysis-simple',
    name: 'Image Recognition Pipeline',
    description: 'Analyze images for object detection and classification',
    category: 'simple',
    tags: ['vision', 'image', 'recognition'],
    machine: {
      name: 'Image Analysis Workflow',
      initial_state: 'upload_image',
      states: [
        {
          id: 'upload_image',
          name: 'Upload Image',
          type: 'tool_call',
          description: 'Receive and validate image input',
          tools: ['file_upload', 's3_storage'],
          transitions: { success: 'detect_objects' }
        },
        {
          id: 'detect_objects',
          name: 'Detect Objects',
          type: 'tool_call',
          description: 'Identify objects and faces in image',
          tools: ['object_detection', 'face_recognition'],
          transitions: { success: 'analyze_content' }
        },
        {
          id: 'analyze_content',
          name: 'Analyze Content',
          type: 'analysis',
          description: 'Extract labels, text, and metadata',
          tools: ['text_extraction', 'metadata_parser'],
          transitions: { success: 'store_results' }
        },
        {
          id: 'store_results',
          name: 'Store Results',
          type: 'tool_call',
          description: 'Save analysis results to database',
          tools: ['database_write'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Return analysis results'
        }
      ],
      edges: [
        { source: 'upload_image', target: 'detect_objects', event: 'success' },
        { source: 'detect_objects', target: 'analyze_content', event: 'success' },
        { source: 'analyze_content', target: 'store_results', event: 'success' },
        { source: 'store_results', target: 'complete', event: 'success' }
      ]
    }
  },

  // ============== MEDIUM COMPLEXITY TEMPLATES ==============
  {
    id: 'sentiment-analysis-pipeline',
    name: 'Customer Feedback Analysis',
    description: 'Analyze customer feedback sentiment across multiple channels',
    category: 'medium',
    tags: ['nlp', 'sentiment', 'analytics'],
    machine: {
      name: 'Sentiment Analysis Pipeline',
      initial_state: 'collect_feedback',
      states: [
        {
          id: 'collect_feedback',
          name: 'Collect Feedback',
          type: 'parallel',
          description: 'Gather feedback from multiple sources',
          tools: ['api_connector', 'database_query', 'file_reader'],
          transitions: { success: 'preprocess_text' }
        },
        {
          id: 'preprocess_text',
          name: 'Preprocess Text',
          type: 'transformation',
          description: 'Clean and normalize text data',
          tools: ['text_cleaner', 'language_detector'],
          transitions: { success: 'detect_language' }
        },
        {
          id: 'detect_language',
          name: 'Detect Language',
          type: 'decision',
          description: 'Identify language and route accordingly',
          tools: ['language_detector'],
          transitions: {
            english: 'analyze_sentiment',
            other: 'translate_text'
          }
        },
        {
          id: 'translate_text',
          name: 'Translate Text',
          type: 'tool_call',
          description: 'Translate to English for analysis',
          tools: ['translator'],
          transitions: { success: 'analyze_sentiment' }
        },
        {
          id: 'analyze_sentiment',
          name: 'Analyze Sentiment',
          type: 'tool_call',
          description: 'Perform sentiment and emotion analysis',
          tools: ['sentiment_analyzer', 'emotion_detector'],
          transitions: { success: 'extract_entities' }
        },
        {
          id: 'extract_entities',
          name: 'Extract Key Entities',
          type: 'tool_call',
          description: 'Identify products, features, and issues mentioned',
          tools: ['entity_extractor', 'keyword_extractor'],
          transitions: { success: 'categorize_feedback' }
        },
        {
          id: 'categorize_feedback',
          name: 'Categorize Feedback',
          type: 'decision',
          description: 'Route based on sentiment and priority',
          transitions: {
            critical: 'urgent_alert',
            negative: 'create_ticket',
            positive: 'aggregate_insights'
          }
        },
        {
          id: 'urgent_alert',
          name: 'Send Urgent Alert',
          type: 'tool_call',
          description: 'Notify team of critical issues',
          tools: ['notification_service'],
          transitions: { success: 'create_ticket' }
        },
        {
          id: 'create_ticket',
          name: 'Create Support Ticket',
          type: 'tool_call',
          description: 'Generate ticket for follow-up',
          tools: ['ticket_system'],
          transitions: { success: 'aggregate_insights' }
        },
        {
          id: 'aggregate_insights',
          name: 'Aggregate Insights',
          type: 'aggregation',
          description: 'Compile analytics and trends',
          tools: ['analytics_engine'],
          transitions: { success: 'generate_report' }
        },
        {
          id: 'generate_report',
          name: 'Generate Report',
          type: 'transformation',
          description: 'Create dashboard and reports',
          tools: ['report_generator', 'visualization_tool'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Feedback analysis complete'
        }
      ],
      edges: [
        { source: 'collect_feedback', target: 'preprocess_text', event: 'success' },
        { source: 'preprocess_text', target: 'detect_language', event: 'success' },
        { source: 'detect_language', target: 'analyze_sentiment', event: 'english' },
        { source: 'detect_language', target: 'translate_text', event: 'other' },
        { source: 'translate_text', target: 'analyze_sentiment', event: 'success' },
        { source: 'analyze_sentiment', target: 'extract_entities', event: 'success' },
        { source: 'extract_entities', target: 'categorize_feedback', event: 'success' },
        { source: 'categorize_feedback', target: 'urgent_alert', event: 'critical' },
        { source: 'categorize_feedback', target: 'create_ticket', event: 'negative' },
        { source: 'categorize_feedback', target: 'aggregate_insights', event: 'positive' },
        { source: 'urgent_alert', target: 'create_ticket', event: 'success' },
        { source: 'create_ticket', target: 'aggregate_insights', event: 'success' },
        { source: 'aggregate_insights', target: 'generate_report', event: 'success' },
        { source: 'generate_report', target: 'complete', event: 'success' }
      ]
    }
  },

  {
    id: 'iot-device-management',
    name: 'IoT Device Fleet Management',
    description: 'Manage and monitor IoT device fleet with predictive maintenance',
    category: 'medium',
    tags: ['iot', 'devices', 'monitoring'],
    machine: {
      name: 'IoT Fleet Management',
      initial_state: 'device_discovery',
      states: [
        {
          id: 'device_discovery',
          name: 'Discover Devices',
          type: 'tool_call',
          description: 'Scan and register IoT devices',
          tools: ['device_scanner', 'registry_api'],
          transitions: { success: 'establish_connection' }
        },
        {
          id: 'establish_connection',
          name: 'Establish Connection',
          type: 'parallel',
          description: 'Connect to multiple devices simultaneously',
          tools: ['mqtt_client', 'websocket_client'],
          transitions: { success: 'collect_telemetry' }
        },
        {
          id: 'collect_telemetry',
          name: 'Collect Telemetry',
          type: 'loop',
          description: 'Continuously gather device metrics',
          tools: ['telemetry_collector', 'time_series_db'],
          transitions: {
            success: 'analyze_health',
            threshold_exceeded: 'trigger_alert'
          }
        },
        {
          id: 'analyze_health',
          name: 'Analyze Device Health',
          type: 'analysis',
          description: 'Assess device performance and predict failures',
          tools: ['anomaly_detector', 'ml_predictor'],
          transitions: {
            healthy: 'collect_telemetry',
            maintenance_needed: 'schedule_maintenance',
            critical: 'immediate_action'
          }
        },
        {
          id: 'trigger_alert',
          name: 'Trigger Alert',
          type: 'tool_call',
          description: 'Send notifications for threshold violations',
          tools: ['alert_manager', 'notification_service'],
          transitions: { success: 'analyze_health' }
        },
        {
          id: 'schedule_maintenance',
          name: 'Schedule Maintenance',
          type: 'tool_call',
          description: 'Plan preventive maintenance',
          tools: ['scheduler', 'work_order_system'],
          transitions: { success: 'update_firmware' }
        },
        {
          id: 'immediate_action',
          name: 'Take Immediate Action',
          type: 'decision',
          description: 'Determine critical response',
          transitions: {
            reboot: 'remote_reboot',
            replace: 'create_replacement_order',
            investigate: 'deep_diagnostics'
          }
        },
        {
          id: 'remote_reboot',
          name: 'Remote Reboot',
          type: 'tool_call',
          description: 'Restart device remotely',
          tools: ['device_manager'],
          transitions: { success: 'collect_telemetry' }
        },
        {
          id: 'update_firmware',
          name: 'Update Firmware',
          type: 'tool_call',
          description: 'Deploy firmware updates',
          tools: ['ota_updater'],
          transitions: { success: 'collect_telemetry' }
        },
        {
          id: 'deep_diagnostics',
          name: 'Run Deep Diagnostics',
          type: 'analysis',
          description: 'Perform comprehensive device analysis',
          tools: ['diagnostic_suite'],
          transitions: { success: 'generate_report' }
        },
        {
          id: 'create_replacement_order',
          name: 'Order Replacement',
          type: 'tool_call',
          description: 'Initiate device replacement',
          tools: ['inventory_system', 'order_management'],
          transitions: { success: 'generate_report' }
        },
        {
          id: 'generate_report',
          name: 'Generate Report',
          type: 'transformation',
          description: 'Create maintenance and health reports',
          tools: ['report_generator'],
          transitions: { success: 'collect_telemetry' }
        }
      ],
      edges: [
        { source: 'device_discovery', target: 'establish_connection', event: 'success' },
        { source: 'establish_connection', target: 'collect_telemetry', event: 'success' },
        { source: 'collect_telemetry', target: 'analyze_health', event: 'success' },
        { source: 'collect_telemetry', target: 'trigger_alert', event: 'threshold_exceeded' },
        { source: 'analyze_health', target: 'collect_telemetry', event: 'healthy' },
        { source: 'analyze_health', target: 'schedule_maintenance', event: 'maintenance_needed' },
        { source: 'analyze_health', target: 'immediate_action', event: 'critical' },
        { source: 'trigger_alert', target: 'analyze_health', event: 'success' },
        { source: 'schedule_maintenance', target: 'update_firmware', event: 'success' },
        { source: 'immediate_action', target: 'remote_reboot', event: 'reboot' },
        { source: 'immediate_action', target: 'create_replacement_order', event: 'replace' },
        { source: 'immediate_action', target: 'deep_diagnostics', event: 'investigate' },
        { source: 'remote_reboot', target: 'collect_telemetry', event: 'success' },
        { source: 'update_firmware', target: 'collect_telemetry', event: 'success' },
        { source: 'deep_diagnostics', target: 'generate_report', event: 'success' },
        { source: 'create_replacement_order', target: 'generate_report', event: 'success' },
        { source: 'generate_report', target: 'collect_telemetry', event: 'success' }
      ]
    }
  },

  // ============== AMAZON DEVICE & SERVICES TEMPLATES ==============
  {
    id: 'echo-device-diagnostics',
    name: 'Echo Device Diagnostics',
    description: 'Automated diagnostic and resolution system for Echo/Alexa devices',
    category: 'complex',
    tags: ['amazon', 'echo', 'alexa', 'diagnostics', 'support'],
    machine: {
      name: 'Echo Device Diagnostics',
      initial_state: 'device_intake',
      states: [
        {
          id: 'device_intake',
          name: 'Device Intake',
          type: 'analysis',
          description: 'Analyze customer complaint and extract device information',
          agent_role: 'Support Analyst',
          tools: ['device_identifier', 'account_lookup'],
          transitions: { success: 'parallel_diagnostics' }
        },
        {
          id: 'parallel_diagnostics',
          name: 'Parallel Diagnostics',
          type: 'parallel',
          description: 'Run multiple diagnostic checks simultaneously',
          agent_role: 'Diagnostic Coordinator',
          tools: [],
          transitions: { all_completed: 'issue_classification' }
        },
        {
          id: 'cloud_health_check',
          name: 'Cloud Health Check',
          type: 'tool_call',
          description: 'Check AWS cloud connectivity and account status',
          agent_role: 'Cloud Specialist',
          tools: ['aws_status_check', 'account_validator'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'local_network_scan',
          name: 'Network Scan',
          type: 'tool_call',
          description: 'Analyze WiFi strength, router compatibility, and network interference',
          agent_role: 'Network Analyst',
          tools: ['network_diagnostics', 'wifi_analyzer'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'voice_history_analysis',
          name: 'Voice History Analysis',
          type: 'analysis',
          description: 'Review last 24 hours of voice commands and responses',
          agent_role: 'Voice Analytics Expert',
          tools: ['alexa_voice_logs', 'nlp_analyzer'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'hardware_status_check',
          name: 'Hardware Status Check',
          type: 'tool_call',
          description: 'Check microphone array, speaker output, and LED indicators',
          agent_role: 'Hardware Specialist',
          tools: ['device_hardware_api', 'diagnostic_mode'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'issue_classification',
          name: 'Issue Classification',
          type: 'decision',
          description: 'Classify issue severity and determine resolution path',
          agent_role: 'Resolution Expert',
          transitions: {
            network_issue: 'network_resolution',
            hardware_failure: 'hardware_resolution',
            software_bug: 'software_resolution',
            user_error: 'user_guidance',
            unknown: 'escalate_to_human'
          }
        },
        {
          id: 'network_resolution',
          name: 'Network Resolution',
          type: 'parallel',
          description: 'Automated network fixes',
          agent_role: 'Network Engineer',
          tools: ['network_reset', 'channel_optimizer', 'dns_updater'],
          transitions: { all_completed: 'verify_fix' }
        },
        {
          id: 'hardware_resolution',
          name: 'Hardware Resolution',
          type: 'decision',
          description: 'Determine if remote fix possible or replacement needed',
          agent_role: 'Hardware Engineer',
          requires_approval: true,
          transitions: {
            remote_fixable: 'remote_hardware_fix',
            needs_replacement: 'initiate_rma'
          }
        },
        {
          id: 'software_resolution',
          name: 'Software Resolution',
          type: 'tool_call',
          description: 'Apply firmware updates and clear cache',
          agent_role: 'Software Engineer',
          tools: ['firmware_updater', 'cache_cleaner', 'factory_reset'],
          transitions: { success: 'verify_fix', failure: 'escalate_to_human' }
        },
        {
          id: 'user_guidance',
          name: 'User Guidance',
          type: 'transformation',
          description: 'Generate personalized troubleshooting guide for customer',
          agent_role: 'Customer Success',
          tools: ['content_generator', 'email_sender'],
          transitions: { success: 'monitor_resolution' }
        },
        {
          id: 'remote_hardware_fix',
          name: 'Remote Hardware Fix',
          type: 'tool_call',
          description: 'Attempt remote calibration and component reset',
          agent_role: 'Remote Support',
          tools: ['remote_calibration', 'component_reset'],
          transitions: { success: 'verify_fix', failure: 'initiate_rma' }
        },
        {
          id: 'initiate_rma',
          name: 'Initiate RMA',
          type: 'tool_call',
          description: 'Create RMA ticket and schedule device replacement',
          agent_role: 'RMA Coordinator',
          tools: ['rma_system', 'logistics_api', 'customer_notification'],
          transitions: { success: 'track_rma' }
        },
        {
          id: 'escalate_to_human',
          name: 'Escalate to Human',
          type: 'human',
          description: 'Complex issue requiring specialist intervention',
          agent_role: 'Level 3 Technical Support',
          transitions: {
            resolved: 'close_ticket',
            needs_engineering: 'engineering_escalation'
          }
        },
        {
          id: 'verify_fix',
          name: 'Verify Fix',
          type: 'validation',
          description: 'Run diagnostic tests to confirm issue resolution',
          agent_role: 'QA Specialist',
          tools: ['device_health_check', 'voice_test'],
          transitions: {
            validated: 'close_ticket',
            invalid: 'escalate_to_human'
          }
        },
        {
          id: 'monitor_resolution',
          name: 'Monitor Resolution',
          type: 'analysis',
          description: 'Monitor device for 24 hours to ensure stability',
          agent_role: 'Monitoring Specialist',
          tools: ['telemetry_monitor', 'alert_system'],
          transitions: { success: 'close_ticket' }
        },
        {
          id: 'track_rma',
          name: 'Track RMA',
          type: 'loop',
          description: 'Track replacement device shipping and setup',
          agent_role: 'Logistics Tracker',
          max_iterations: 10,
          transitions: {
            completed: 'close_ticket',
            timeout: 'escalate_to_human'
          }
        },
        {
          id: 'engineering_escalation',
          name: 'Engineering Escalation',
          type: 'tool_call',
          description: 'Create engineering ticket with full diagnostic data',
          agent_role: 'Engineering Liaison',
          tools: ['jira_integration', 'log_aggregator'],
          transitions: { success: 'close_ticket' }
        },
        {
          id: 'close_ticket',
          name: 'Close Ticket',
          type: 'final',
          description: 'Resolution achieved, update CRM and collect feedback',
          tools: ['crm_update', 'feedback_collector']
        }
      ],
      edges: [
        { source: 'device_intake', target: 'parallel_diagnostics', event: 'success' },
        { source: 'parallel_diagnostics', target: 'issue_classification', event: 'all_completed' },
        { source: 'issue_classification', target: 'network_resolution', event: 'network_issue' },
        { source: 'issue_classification', target: 'hardware_resolution', event: 'hardware_failure' },
        { source: 'issue_classification', target: 'software_resolution', event: 'software_bug' },
        { source: 'issue_classification', target: 'user_guidance', event: 'user_error' },
        { source: 'issue_classification', target: 'escalate_to_human', event: 'unknown' },
        { source: 'network_resolution', target: 'verify_fix', event: 'all_completed' },
        { source: 'hardware_resolution', target: 'remote_hardware_fix', event: 'remote_fixable' },
        { source: 'hardware_resolution', target: 'initiate_rma', event: 'needs_replacement' },
        { source: 'software_resolution', target: 'verify_fix', event: 'success' },
        { source: 'software_resolution', target: 'escalate_to_human', event: 'failure' },
        { source: 'user_guidance', target: 'monitor_resolution', event: 'success' },
        { source: 'remote_hardware_fix', target: 'verify_fix', event: 'success' },
        { source: 'remote_hardware_fix', target: 'initiate_rma', event: 'failure' },
        { source: 'initiate_rma', target: 'track_rma', event: 'success' },
        { source: 'escalate_to_human', target: 'close_ticket', event: 'resolved' },
        { source: 'escalate_to_human', target: 'engineering_escalation', event: 'needs_engineering' },
        { source: 'verify_fix', target: 'close_ticket', event: 'validated' },
        { source: 'verify_fix', target: 'escalate_to_human', event: 'invalid' },
        { source: 'monitor_resolution', target: 'close_ticket', event: 'success' },
        { source: 'track_rma', target: 'close_ticket', event: 'completed' },
        { source: 'track_rma', target: 'escalate_to_human', event: 'timeout' },
        { source: 'engineering_escalation', target: 'close_ticket', event: 'success' }
      ]
    }
  },

  {
    id: 'smart-home-orchestration',
    name: 'Smart Home Setup & Optimization',
    description: 'Intelligent setup and optimization of complete Alexa smart home ecosystem',
    category: 'complex',
    tags: ['amazon', 'smart-home', 'alexa', 'iot', 'automation'],
    machine: {
      name: 'Smart Home Orchestration',
      initial_state: 'initialize_setup',
      states: [
        {
          id: 'initialize_setup',
          name: 'Initialize Setup',
          type: 'analysis',
          description: 'Analyze home layout and existing devices',
          agent_role: 'Setup Coordinator',
          tools: ['home_analyzer', 'device_inventory'],
          transitions: { success: 'network_discovery' }
        },
        {
          id: 'network_discovery',
          name: 'Network Discovery',
          type: 'tool_call',
          description: 'Scan network for compatible smart devices',
          agent_role: 'Network Scanner',
          tools: ['network_scanner', 'device_identifier'],
          transitions: { success: 'device_categorization', failure: 'manual_device_entry' }
        },
        {
          id: 'manual_device_entry',
          name: 'Manual Device Entry',
          type: 'human',
          description: 'User manually inputs device information',
          agent_role: 'Setup Assistant',
          transitions: { success: 'device_categorization' }
        },
        {
          id: 'device_categorization',
          name: 'Device Categorization',
          type: 'analysis',
          description: 'Categorize devices by type, brand, and compatibility',
          agent_role: 'Device Analyst',
          tools: ['device_database', 'compatibility_checker'],
          transitions: { success: 'parallel_device_setup' }
        },
        {
          id: 'parallel_device_setup',
          name: 'Parallel Device Setup',
          type: 'parallel',
          description: 'Configure all device categories simultaneously',
          agent_role: 'Setup Manager',
          tools: [],
          transitions: { all_completed: 'routine_generation' }
        },
        {
          id: 'setup_lighting',
          name: 'Setup Lighting',
          type: 'loop',
          description: 'Configure all smart lights and switches',
          agent_role: 'Lighting Specialist',
          max_iterations: 20,
          tools: ['philips_hue_api', 'lifx_api', 'smart_switch_api'],
          transitions: { completed: 'return', failure: 'lighting_fallback' }
        },
        {
          id: 'setup_security',
          name: 'Setup Security',
          type: 'parallel',
          description: 'Configure security devices',
          agent_role: 'Security Expert',
          tools: ['ring_api', 'arlo_api', 'august_api'],
          transitions: { all_completed: 'return' }
        },
        {
          id: 'setup_climate',
          name: 'Setup Climate',
          type: 'tool_call',
          description: 'Connect thermostats and environment sensors',
          agent_role: 'Climate Specialist',
          tools: ['nest_api', 'ecobee_api', 'sensor_config'],
          transitions: { success: 'return', failure: 'climate_fallback' }
        },
        {
          id: 'setup_entertainment',
          name: 'Setup Entertainment',
          type: 'tool_call',
          description: 'Configure Fire TV, sound systems, and streaming devices',
          agent_role: 'Entertainment Expert',
          tools: ['firetv_api', 'sonos_api', 'spotify_connect'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'setup_appliances',
          name: 'Setup Appliances',
          type: 'tool_call',
          description: 'Connect smart appliances and outlets',
          agent_role: 'Appliance Specialist',
          tools: ['smart_plug_api', 'appliance_connector'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'lighting_fallback',
          name: 'Lighting Fallback',
          type: 'human',
          description: 'Manual intervention for unsupported lighting',
          agent_role: 'Smart Home Specialist',
          transitions: { success: 'return' }
        },
        {
          id: 'climate_fallback',
          name: 'Climate Fallback',
          type: 'analysis',
          description: 'Alternative climate control setup',
          agent_role: 'Climate Expert',
          transitions: { success: 'return' }
        },
        {
          id: 'routine_generation',
          name: 'Routine Generation',
          type: 'transformation',
          description: 'AI generates personalized Alexa routines based on devices',
          agent_role: 'Routine Designer',
          tools: ['routine_generator', 'ai_optimizer'],
          transitions: { success: 'routine_validation' }
        },
        {
          id: 'routine_validation',
          name: 'Routine Validation',
          type: 'decision',
          description: 'User reviews and approves suggested routines',
          agent_role: 'Validation Expert',
          requires_approval: true,
          transitions: {
            approved: 'room_configuration',
            rejected: 'custom_routine_creation'
          }
        },
        {
          id: 'custom_routine_creation',
          name: 'Custom Routine Creation',
          type: 'human',
          description: 'User creates custom routines with guidance',
          agent_role: 'Routine Designer',
          transitions: { success: 'room_configuration' }
        },
        {
          id: 'room_configuration',
          name: 'Room Configuration',
          type: 'loop',
          description: 'Assign devices to rooms and create groups',
          agent_role: 'Room Organizer',
          max_iterations: 15,
          tools: ['room_mapper', 'device_grouper'],
          transitions: { completed: 'voice_training' }
        },
        {
          id: 'voice_training',
          name: 'Voice Training',
          type: 'parallel',
          description: 'Train Alexa for household voices and preferences',
          agent_role: 'Voice Coach',
          tools: ['voice_recognition', 'profile_creator'],
          transitions: { all_completed: 'system_test' }
        },
        {
          id: 'system_test',
          name: 'System Test',
          type: 'validation',
          description: 'Comprehensive testing of all integrations',
          agent_role: 'QA Engineer',
          tools: ['integration_tester', 'performance_monitor'],
          transitions: {
            validated: 'optimization',
            invalid: 'troubleshooting'
          }
        },
        {
          id: 'troubleshooting',
          name: 'Troubleshooting',
          type: 'analysis',
          description: 'Identify and fix integration issues',
          agent_role: 'Troubleshooting Expert',
          tools: ['diagnostic_suite', 'auto_fixer'],
          transitions: {
            success: 'system_test',
            failure: 'manual_intervention'
          }
        },
        {
          id: 'manual_intervention',
          name: 'Manual Intervention',
          type: 'human',
          description: 'Expert assistance for complex issues',
          agent_role: 'Integration Specialist',
          transitions: { success: 'optimization' }
        },
        {
          id: 'optimization',
          name: 'Optimization',
          type: 'tool_call',
          description: 'Optimize system performance and energy efficiency',
          agent_role: 'Optimization Expert',
          tools: ['performance_optimizer', 'energy_analyzer', 'scene_optimizer'],
          transitions: { success: 'monitoring' }
        },
        {
          id: 'monitoring',
          name: 'Monitoring',
          type: 'loop',
          description: 'Continuous monitoring and learning for 7 days',
          agent_role: 'Monitoring Specialist',
          max_iterations: 7,
          tools: ['usage_tracker', 'anomaly_detector', 'suggestion_engine'],
          transitions: { completed: 'final_report' }
        },
        {
          id: 'final_report',
          name: 'Final Report',
          type: 'final',
          description: 'Generate setup report and optimization recommendations',
          tools: ['report_generator', 'recommendation_engine', 'email_sender']
        }
      ],
      edges: [
        { source: 'initialize_setup', target: 'network_discovery', event: 'success' },
        { source: 'network_discovery', target: 'device_categorization', event: 'success' },
        { source: 'network_discovery', target: 'manual_device_entry', event: 'failure' },
        { source: 'manual_device_entry', target: 'device_categorization', event: 'success' },
        { source: 'device_categorization', target: 'parallel_device_setup', event: 'success' },
        { source: 'parallel_device_setup', target: 'routine_generation', event: 'all_completed' },
        { source: 'setup_lighting', target: 'return', event: 'completed' },
        { source: 'setup_lighting', target: 'lighting_fallback', event: 'failure' },
        { source: 'setup_security', target: 'return', event: 'all_completed' },
        { source: 'setup_climate', target: 'return', event: 'success' },
        { source: 'setup_climate', target: 'climate_fallback', event: 'failure' },
        { source: 'setup_entertainment', target: 'return', event: 'success' },
        { source: 'setup_appliances', target: 'return', event: 'success' },
        { source: 'lighting_fallback', target: 'return', event: 'success' },
        { source: 'climate_fallback', target: 'return', event: 'success' },
        { source: 'routine_generation', target: 'routine_validation', event: 'success' },
        { source: 'routine_validation', target: 'room_configuration', event: 'approved' },
        { source: 'routine_validation', target: 'custom_routine_creation', event: 'rejected' },
        { source: 'custom_routine_creation', target: 'room_configuration', event: 'success' },
        { source: 'room_configuration', target: 'voice_training', event: 'completed' },
        { source: 'voice_training', target: 'system_test', event: 'all_completed' },
        { source: 'system_test', target: 'optimization', event: 'validated' },
        { source: 'system_test', target: 'troubleshooting', event: 'invalid' },
        { source: 'troubleshooting', target: 'system_test', event: 'success' },
        { source: 'troubleshooting', target: 'manual_intervention', event: 'failure' },
        { source: 'manual_intervention', target: 'optimization', event: 'success' },
        { source: 'optimization', target: 'monitoring', event: 'success' },
        { source: 'monitoring', target: 'final_report', event: 'completed' }
      ]
    }
  },

  // ============== COMPLEX TEMPLATES ==============
  {
    id: 'multimodal-ai-pipeline',
    name: 'Multi-Modal Document Intelligence',
    description: 'Process documents with OCR, NLP, and translation for global operations',
    category: 'complex',
    tags: ['ocr', 'nlp', 'translation', 'document'],
    machine: {
      name: 'Document Intelligence Pipeline',
      initial_state: 'ingest_document',
      states: [
        {
          id: 'ingest_document',
          name: 'Ingest Document',
          type: 'tool_call',
          description: 'Receive documents from multiple sources',
          tools: ['file_upload', 's3_storage', 'api_gateway'],
          transitions: { success: 'classify_document' }
        },
        {
          id: 'classify_document',
          name: 'Classify Document Type',
          type: 'decision',
          description: 'Identify document type and route processing',
          tools: ['document_classifier'],
          transitions: {
            invoice: 'process_invoice',
            contract: 'process_contract',
            form: 'process_form',
            general: 'extract_text'
          }
        },
        {
          id: 'process_invoice',
          name: 'Process Invoice',
          type: 'parallel',
          description: 'Extract invoice-specific data',
          tools: ['invoice_parser', 'table_extractor'],
          transitions: { success: 'validate_extraction' }
        },
        {
          id: 'process_contract',
          name: 'Process Contract',
          type: 'analysis',
          description: 'Extract and analyze contract terms',
          tools: ['contract_analyzer', 'clause_extractor'],
          transitions: { success: 'validate_extraction' }
        },
        {
          id: 'process_form',
          name: 'Process Form',
          type: 'tool_call',
          description: 'Extract form fields and validate',
          tools: ['form_recognizer', 'field_validator'],
          transitions: { success: 'validate_extraction' }
        },
        {
          id: 'extract_text',
          name: 'Extract Text',
          type: 'tool_call',
          description: 'OCR and text extraction from images/PDFs',
          tools: ['ocr_engine', 'pdf_parser'],
          transitions: { success: 'detect_language' }
        },
        {
          id: 'validate_extraction',
          name: 'Validate Extraction',
          type: 'validation',
          description: 'Verify extracted data accuracy',
          tools: ['data_validator', 'confidence_checker'],
          transitions: {
            validated: 'extract_text',
            invalid: 'human_review'
          }
        },
        {
          id: 'human_review',
          name: 'Human Review',
          type: 'human',
          description: 'Manual validation and correction',
          tools: ['review_interface'],
          transitions: { success: 'extract_text' }
        },
        {
          id: 'detect_language',
          name: 'Detect Language',
          type: 'analysis',
          description: 'Identify document language',
          tools: ['language_detector'],
          transitions: { success: 'check_translation_need' }
        },
        {
          id: 'check_translation_need',
          name: 'Check Translation Need',
          type: 'decision',
          description: 'Determine if translation required',
          transitions: {
            translate: 'translate_content',
            no_translate: 'extract_entities'
          }
        },
        {
          id: 'translate_content',
          name: 'Translate Content',
          type: 'tool_call',
          description: 'Translate to target languages',
          tools: ['neural_translator'],
          transitions: { success: 'extract_entities' }
        },
        {
          id: 'extract_entities',
          name: 'Extract Entities',
          type: 'parallel',
          description: 'Extract names, dates, amounts, addresses',
          tools: ['ner_extractor', 'regex_parser'],
          transitions: { success: 'analyze_sentiment' }
        },
        {
          id: 'analyze_sentiment',
          name: 'Analyze Sentiment',
          type: 'tool_call',
          description: 'Determine document tone and urgency',
          tools: ['sentiment_analyzer'],
          transitions: { success: 'extract_key_phrases' }
        },
        {
          id: 'extract_key_phrases',
          name: 'Extract Key Phrases',
          type: 'tool_call',
          description: 'Identify important phrases and topics',
          tools: ['keyphrase_extractor', 'topic_modeler'],
          transitions: { success: 'apply_business_rules' }
        },
        {
          id: 'apply_business_rules',
          name: 'Apply Business Rules',
          type: 'decision',
          description: 'Apply compliance and routing rules',
          tools: ['rules_engine'],
          transitions: {
            compliant: 'generate_metadata',
            non_compliant: 'flag_for_review',
            escalate: 'priority_queue'
          }
        },
        {
          id: 'flag_for_review',
          name: 'Flag for Review',
          type: 'tool_call',
          description: 'Mark for compliance review',
          tools: ['compliance_system'],
          transitions: { success: 'generate_metadata' }
        },
        {
          id: 'priority_queue',
          name: 'Priority Queue',
          type: 'tool_call',
          description: 'Route to priority processing',
          tools: ['queue_manager'],
          transitions: { success: 'generate_metadata' }
        },
        {
          id: 'generate_metadata',
          name: 'Generate Metadata',
          type: 'transformation',
          description: 'Create comprehensive document metadata',
          tools: ['metadata_generator'],
          transitions: { success: 'index_document' }
        },
        {
          id: 'index_document',
          name: 'Index Document',
          type: 'tool_call',
          description: 'Index for search and retrieval',
          tools: ['search_indexer', 'vector_db'],
          transitions: { success: 'store_results' }
        },
        {
          id: 'store_results',
          name: 'Store Results',
          type: 'parallel',
          description: 'Store in multiple systems',
          tools: ['database_writer', 'data_lake_writer', 'cache_writer'],
          transitions: { success: 'trigger_workflows' }
        },
        {
          id: 'trigger_workflows',
          name: 'Trigger Downstream Workflows',
          type: 'tool_call',
          description: 'Initiate dependent processes',
          tools: ['workflow_orchestrator', 'event_publisher'],
          transitions: { success: 'generate_summary' }
        },
        {
          id: 'generate_summary',
          name: 'Generate Summary',
          type: 'transformation',
          description: 'Create document summary and insights',
          tools: ['summarizer', 'insight_generator'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Document processing complete'
        }
      ],
      edges: [
        { source: 'ingest_document', target: 'classify_document', event: 'success' },
        { source: 'classify_document', target: 'process_invoice', event: 'invoice' },
        { source: 'classify_document', target: 'process_contract', event: 'contract' },
        { source: 'classify_document', target: 'process_form', event: 'form' },
        { source: 'classify_document', target: 'extract_text', event: 'general' },
        { source: 'process_invoice', target: 'validate_extraction', event: 'success' },
        { source: 'process_contract', target: 'validate_extraction', event: 'success' },
        { source: 'process_form', target: 'validate_extraction', event: 'success' },
        { source: 'validate_extraction', target: 'extract_text', event: 'validated' },
        { source: 'validate_extraction', target: 'human_review', event: 'invalid' },
        { source: 'human_review', target: 'extract_text', event: 'success' },
        { source: 'extract_text', target: 'detect_language', event: 'success' },
        { source: 'detect_language', target: 'check_translation_need', event: 'success' },
        { source: 'check_translation_need', target: 'translate_content', event: 'translate' },
        { source: 'check_translation_need', target: 'extract_entities', event: 'no_translate' },
        { source: 'translate_content', target: 'extract_entities', event: 'success' },
        { source: 'extract_entities', target: 'analyze_sentiment', event: 'success' },
        { source: 'analyze_sentiment', target: 'extract_key_phrases', event: 'success' },
        { source: 'extract_key_phrases', target: 'apply_business_rules', event: 'success' },
        { source: 'apply_business_rules', target: 'generate_metadata', event: 'compliant' },
        { source: 'apply_business_rules', target: 'flag_for_review', event: 'non_compliant' },
        { source: 'apply_business_rules', target: 'priority_queue', event: 'escalate' },
        { source: 'flag_for_review', target: 'generate_metadata', event: 'success' },
        { source: 'priority_queue', target: 'generate_metadata', event: 'success' },
        { source: 'generate_metadata', target: 'index_document', event: 'success' },
        { source: 'index_document', target: 'store_results', event: 'success' },
        { source: 'store_results', target: 'trigger_workflows', event: 'success' },
        { source: 'trigger_workflows', target: 'generate_summary', event: 'success' },
        { source: 'generate_summary', target: 'complete', event: 'success' }
      ]
    }
  },

  {
    id: 'ml-pipeline-e2e',
    name: 'End-to-End ML Model Pipeline',
    description: 'Complete ML workflow from data preparation to model deployment and monitoring',
    category: 'complex',
    tags: ['ml', 'training', 'deployment', 'monitoring'],
    machine: {
      name: 'ML Pipeline',
      initial_state: 'data_ingestion',
      states: [
        {
          id: 'data_ingestion',
          name: 'Data Ingestion',
          type: 'parallel',
          description: 'Collect data from multiple sources',
          tools: ['s3_reader', 'database_connector', 'streaming_consumer'],
          transitions: { success: 'data_validation' }
        },
        {
          id: 'data_validation',
          name: 'Validate Data Quality',
          type: 'validation',
          description: 'Check data quality and completeness',
          tools: ['data_profiler', 'schema_validator'],
          transitions: {
            validated: 'data_preprocessing',
            invalid: 'data_cleaning'
          }
        },
        {
          id: 'data_cleaning',
          name: 'Clean Data',
          type: 'transformation',
          description: 'Handle missing values and outliers',
          tools: ['data_cleaner', 'outlier_detector'],
          transitions: { success: 'data_preprocessing' }
        },
        {
          id: 'data_preprocessing',
          name: 'Preprocess Data',
          type: 'parallel',
          description: 'Feature engineering and transformation',
          tools: ['feature_engineer', 'data_transformer', 'encoder'],
          transitions: { success: 'split_dataset' }
        },
        {
          id: 'split_dataset',
          name: 'Split Dataset',
          type: 'transformation',
          description: 'Create train, validation, and test sets',
          tools: ['data_splitter'],
          transitions: { success: 'feature_selection' }
        },
        {
          id: 'feature_selection',
          name: 'Select Features',
          type: 'analysis',
          description: 'Identify most important features',
          tools: ['feature_selector', 'correlation_analyzer'],
          transitions: { success: 'model_selection' }
        },
        {
          id: 'model_selection',
          name: 'Select Models',
          type: 'decision',
          description: 'Choose appropriate ML algorithms',
          transitions: {
            classification: 'train_classifier',
            regression: 'train_regressor',
            clustering: 'train_clusterer',
            deep_learning: 'train_neural_network'
          }
        },
        {
          id: 'train_classifier',
          name: 'Train Classification Models',
          type: 'parallel',
          description: 'Train multiple classification algorithms',
          tools: ['xgboost', 'random_forest', 'svm'],
          transitions: { success: 'hyperparameter_tuning' }
        },
        {
          id: 'train_regressor',
          name: 'Train Regression Models',
          type: 'parallel',
          description: 'Train regression algorithms',
          tools: ['linear_regression', 'gradient_boost'],
          transitions: { success: 'hyperparameter_tuning' }
        },
        {
          id: 'train_clusterer',
          name: 'Train Clustering Models',
          type: 'tool_call',
          description: 'Train unsupervised models',
          tools: ['kmeans', 'dbscan'],
          transitions: { success: 'hyperparameter_tuning' }
        },
        {
          id: 'train_neural_network',
          name: 'Train Neural Network',
          type: 'loop',
          description: 'Train deep learning model with epochs',
          tools: ['tensorflow', 'pytorch'],
          transitions: { success: 'hyperparameter_tuning' }
        },
        {
          id: 'hyperparameter_tuning',
          name: 'Tune Hyperparameters',
          type: 'loop',
          description: 'Optimize model parameters',
          tools: ['grid_search', 'bayesian_optimization'],
          transitions: { success: 'cross_validation' }
        },
        {
          id: 'cross_validation',
          name: 'Cross Validate',
          type: 'validation',
          description: 'Validate model performance',
          tools: ['kfold_validator'],
          transitions: { success: 'evaluate_models' }
        },
        {
          id: 'evaluate_models',
          name: 'Evaluate Models',
          type: 'analysis',
          description: 'Compare model performances',
          tools: ['metric_calculator', 'roc_analyzer'],
          transitions: { success: 'select_best_model' }
        },
        {
          id: 'select_best_model',
          name: 'Select Best Model',
          type: 'decision',
          description: 'Choose best performing model',
          transitions: {
            acceptable: 'explainability_analysis',
            needs_ensemble: 'create_ensemble',
            poor_performance: 'retrain_decision'
          }
        },
        {
          id: 'create_ensemble',
          name: 'Create Ensemble',
          type: 'transformation',
          description: 'Combine multiple models',
          tools: ['ensemble_builder'],
          transitions: { success: 'explainability_analysis' }
        },
        {
          id: 'retrain_decision',
          name: 'Retrain Decision',
          type: 'human',
          description: 'Decide on retraining strategy',
          transitions: {
            retrain: 'data_preprocessing',
            proceed: 'explainability_analysis'
          }
        },
        {
          id: 'explainability_analysis',
          name: 'Explain Model',
          type: 'analysis',
          description: 'Generate model explanations',
          tools: ['shap_explainer', 'lime_explainer'],
          transitions: { success: 'bias_detection' }
        },
        {
          id: 'bias_detection',
          name: 'Detect Bias',
          type: 'validation',
          description: 'Check for model bias and fairness',
          tools: ['bias_detector', 'fairness_checker'],
          transitions: {
            no_bias: 'package_model',
            bias_detected: 'bias_mitigation'
          }
        },
        {
          id: 'bias_mitigation',
          name: 'Mitigate Bias',
          type: 'transformation',
          description: 'Apply bias correction techniques',
          tools: ['bias_corrector'],
          transitions: { success: 'package_model' }
        },
        {
          id: 'package_model',
          name: 'Package Model',
          type: 'transformation',
          description: 'Create deployable model package',
          tools: ['model_serializer', 'container_builder'],
          transitions: { success: 'integration_testing' }
        },
        {
          id: 'integration_testing',
          name: 'Integration Testing',
          type: 'validation',
          description: 'Test model in staging environment',
          tools: ['api_tester', 'load_tester'],
          transitions: {
            passed: 'deploy_model',
            failed: 'debug_issues'
          }
        },
        {
          id: 'debug_issues',
          name: 'Debug Issues',
          type: 'analysis',
          description: 'Identify and fix deployment issues',
          tools: ['debugger', 'log_analyzer'],
          transitions: { success: 'integration_testing' }
        },
        {
          id: 'deploy_model',
          name: 'Deploy Model',
          type: 'tool_call',
          description: 'Deploy to production environment',
          tools: ['model_deployer', 'endpoint_creator'],
          transitions: { success: 'configure_monitoring' }
        },
        {
          id: 'configure_monitoring',
          name: 'Configure Monitoring',
          type: 'tool_call',
          description: 'Set up model monitoring and alerts',
          tools: ['monitor_setup', 'alert_configurator'],
          transitions: { success: 'ab_testing' }
        },
        {
          id: 'ab_testing',
          name: 'A/B Testing',
          type: 'parallel',
          description: 'Compare with existing model',
          tools: ['ab_test_framework'],
          transitions: { success: 'monitor_performance' }
        },
        {
          id: 'monitor_performance',
          name: 'Monitor Performance',
          type: 'loop',
          description: 'Continuously monitor model metrics',
          tools: ['metric_monitor', 'drift_detector'],
          transitions: {
            normal: 'monitor_performance',
            drift_detected: 'trigger_retraining',
            anomaly: 'investigate_anomaly'
          }
        },
        {
          id: 'investigate_anomaly',
          name: 'Investigate Anomaly',
          type: 'analysis',
          description: 'Analyze performance degradation',
          tools: ['anomaly_analyzer'],
          transitions: { success: 'trigger_retraining' }
        },
        {
          id: 'trigger_retraining',
          name: 'Trigger Retraining',
          type: 'decision',
          description: 'Decide on retraining',
          transitions: {
            retrain: 'data_ingestion',
            rollback: 'rollback_model',
            continue: 'monitor_performance'
          }
        },
        {
          id: 'rollback_model',
          name: 'Rollback Model',
          type: 'tool_call',
          description: 'Revert to previous version',
          tools: ['version_controller'],
          transitions: { success: 'monitor_performance' }
        }
      ],
      edges: [
        { source: 'data_ingestion', target: 'data_validation', event: 'success' },
        { source: 'data_validation', target: 'data_preprocessing', event: 'validated' },
        { source: 'data_validation', target: 'data_cleaning', event: 'invalid' },
        { source: 'data_cleaning', target: 'data_preprocessing', event: 'success' },
        { source: 'data_preprocessing', target: 'split_dataset', event: 'success' },
        { source: 'split_dataset', target: 'feature_selection', event: 'success' },
        { source: 'feature_selection', target: 'model_selection', event: 'success' },
        { source: 'model_selection', target: 'train_classifier', event: 'classification' },
        { source: 'model_selection', target: 'train_regressor', event: 'regression' },
        { source: 'model_selection', target: 'train_clusterer', event: 'clustering' },
        { source: 'model_selection', target: 'train_neural_network', event: 'deep_learning' },
        { source: 'train_classifier', target: 'hyperparameter_tuning', event: 'success' },
        { source: 'train_regressor', target: 'hyperparameter_tuning', event: 'success' },
        { source: 'train_clusterer', target: 'hyperparameter_tuning', event: 'success' },
        { source: 'train_neural_network', target: 'hyperparameter_tuning', event: 'success' },
        { source: 'hyperparameter_tuning', target: 'cross_validation', event: 'success' },
        { source: 'cross_validation', target: 'evaluate_models', event: 'success' },
        { source: 'evaluate_models', target: 'select_best_model', event: 'success' },
        { source: 'select_best_model', target: 'explainability_analysis', event: 'acceptable' },
        { source: 'select_best_model', target: 'create_ensemble', event: 'needs_ensemble' },
        { source: 'select_best_model', target: 'retrain_decision', event: 'poor_performance' },
        { source: 'create_ensemble', target: 'explainability_analysis', event: 'success' },
        { source: 'retrain_decision', target: 'data_preprocessing', event: 'retrain' },
        { source: 'retrain_decision', target: 'explainability_analysis', event: 'proceed' },
        { source: 'explainability_analysis', target: 'bias_detection', event: 'success' },
        { source: 'bias_detection', target: 'package_model', event: 'no_bias' },
        { source: 'bias_detection', target: 'bias_mitigation', event: 'bias_detected' },
        { source: 'bias_mitigation', target: 'package_model', event: 'success' },
        { source: 'package_model', target: 'integration_testing', event: 'success' },
        { source: 'integration_testing', target: 'deploy_model', event: 'passed' },
        { source: 'integration_testing', target: 'debug_issues', event: 'failed' },
        { source: 'debug_issues', target: 'integration_testing', event: 'success' },
        { source: 'deploy_model', target: 'configure_monitoring', event: 'success' },
        { source: 'configure_monitoring', target: 'ab_testing', event: 'success' },
        { source: 'ab_testing', target: 'monitor_performance', event: 'success' },
        { source: 'monitor_performance', target: 'monitor_performance', event: 'normal' },
        { source: 'monitor_performance', target: 'trigger_retraining', event: 'drift_detected' },
        { source: 'monitor_performance', target: 'investigate_anomaly', event: 'anomaly' },
        { source: 'investigate_anomaly', target: 'trigger_retraining', event: 'success' },
        { source: 'trigger_retraining', target: 'data_ingestion', event: 'retrain' },
        { source: 'trigger_retraining', target: 'rollback_model', event: 'rollback' },
        { source: 'trigger_retraining', target: 'monitor_performance', event: 'continue' },
        { source: 'rollback_model', target: 'monitor_performance', event: 'success' }
      ]
    }
  }
];

// Helper function to get templates by category
export const getTemplatesByCategory = (category: 'simple' | 'medium' | 'complex') => {
  return workflowTemplates.filter(t => t.category === category);
};

// Helper function to get templates by tags
export const getTemplatesByTags = (tags: string[]) => {
  return workflowTemplates.filter(t =>
    tags.some(tag => t.tags.includes(tag))
  );
};