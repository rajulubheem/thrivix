import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  Chip,
  Avatar,
  LinearProgress,
  IconButton,
  Tabs,
  Tab,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Collapse,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Tooltip,
  Badge,
  Switch,
  FormControlLabel,
  Stack,
  useTheme,
  alpha,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';

import {
  PlayArrow,
  Stop,
  Settings,
  Code,
  Psychology,
  Build,
  CheckCircle,
  Error,
  Warning,
  Info,
  ExpandMore,
  ExpandLess,
  Add,
  Delete,
  Edit,
  Visibility,
  VisibilityOff,
  Terminal,
  Storage,
  CloudUpload,
  BugReport,
  Speed,
  Timeline,
  AutoAwesome,
  SmartToy,
  Science,
  Analytics,
  Memory,
  Extension,
  Hub,
  Api,
  WebAsset,
  DataObject,
  Functions,
  Search,
  Description,
  FolderOpen,
  Email,
  Calculate,
  CloudQueue
} from '@mui/icons-material';

// Create Material Design 3 theme
const md3Theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#006494',
      light: '#4a90c2',
      dark: '#003d66',
    },
    secondary: {
      main: '#546e7a',
      light: '#819ca9',
      dark: '#29434e',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    success: {
      main: '#2e7d32',
    },
    error: {
      main: '#d32f2f',
    },
    warning: {
      main: '#ed6c02',
    },
    info: {
      main: '#0288d1',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 500,
    },
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

// Tool icon mapping
const toolIcons: Record<string, React.ReactElement> = {
  file_read: <Description />,
  file_write: <Edit />,
  file_delete: <Delete />,
  directory_list: <FolderOpen />,
  web_search: <Search />,
  tavily_search: <Search color="secondary" />,
  web_scrape: <WebAsset />,
  code_execute: <Terminal />,
  code_review: <BugReport />,
  calculator: <Calculate />,
  data_query: <Storage />,
  http_request: <Api />,
  email_send: <Email />,
  llm_query: <Psychology />,
  embedding_create: <DataObject />,
};

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  tools: string[];
  model: string;
  progress: number;
  currentTask?: string;
  output?: string;
}

interface ToolTest {
  tool_name: string;
  status: 'success' | 'failed' | 'error';
  execution_time: number;
  timestamp: string;
}

interface TaskAnalysis {
  task_type: string;
  complexity: string;
  domains: string[];
  required_capabilities: string[];
  suggested_workflow: string;
  estimated_agents: number;
}

const ModernDashboard: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [task, setTask] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [taskAnalysis, setTaskAnalysis] = useState<TaskAnalysis | null>(null);
  const [toolTests, setToolTests] = useState<ToolTest[]>([]);
  const [showToolTesting, setShowToolTesting] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [useDynamicAgents, setUseDynamicAgents] = useState(true);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' as any });

  // Available tools
  const availableTools = [
    { name: 'file_read', category: 'File Operations' },
    { name: 'file_write', category: 'File Operations' },
    { name: 'directory_list', category: 'File Operations' },
    { name: 'web_search', category: 'Web' },
    { name: 'tavily_search', category: 'Web' },
    { name: 'web_scrape', category: 'Web' },
    { name: 'code_execute', category: 'Code' },
    { name: 'code_review', category: 'Code' },
    { name: 'calculator', category: 'Data' },
    { name: 'data_query', category: 'Data' },
    { name: 'http_request', category: 'API' },
    { name: 'llm_query', category: 'AI' },
    { name: 'embedding_create', category: 'AI' },
  ];

  const handleOrchestrate = async () => {
    if (!task.trim()) return;

    setIsExecuting(true);
    try {
      const response = await fetch('/api/v1/orchestrator/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ task }),
      });

      if (response.ok) {
        const data = await response.json();
        setTaskAnalysis(data.analysis);
        
        // Convert orchestrated agents to UI agents
        const newAgents = data.agents.map((agent: any, index: number) => ({
          id: `agent-${index}`,
          name: agent.name,
          role: agent.description,
          status: 'idle' as const,
          tools: agent.tools,
          model: agent.model,
          progress: 0,
        }));
        
        setAgents(newAgents);
        setNotification({
          open: true,
          message: `Generated ${newAgents.length} agents for your task`,
          severity: 'success',
        });
      }
    } catch (error) {
      console.error('Orchestration failed:', error);
      setNotification({
        open: true,
        message: 'Failed to orchestrate task',
        severity: 'error',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecute = async () => {
    if (agents.length === 0) {
      await handleOrchestrate();
    }
    
    setIsExecuting(true);
    // Simulate execution
    agents.forEach((agent, index) => {
      setTimeout(() => {
        setAgents(prev => prev.map(a => 
          a.id === agent.id 
            ? { ...a, status: 'working', progress: 50, currentTask: 'Processing...' }
            : a
        ));
      }, index * 2000);
      
      setTimeout(() => {
        setAgents(prev => prev.map(a => 
          a.id === agent.id 
            ? { ...a, status: 'completed', progress: 100, currentTask: undefined }
            : a
        ));
      }, (index * 2000) + 3000);
    });
    
    setTimeout(() => {
      setIsExecuting(false);
      setNotification({
        open: true,
        message: 'Task execution completed successfully',
        severity: 'success',
      });
    }, agents.length * 2000 + 3000);
  };

  const handleTestTool = async (toolName: string) => {
    try {
      const response = await fetch('/api/v1/tools/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ tool_name: toolName }),
      });

      if (response.ok) {
        const result = await response.json();
        setToolTests(prev => [result, ...prev.slice(0, 9)]);
        setNotification({
          open: true,
          message: `Tool ${toolName} tested: ${result.status}`,
          severity: result.status === 'success' ? 'success' : 'error',
        });
      }
    } catch (error) {
      console.error('Tool test failed:', error);
      setNotification({
        open: true,
        message: 'Tool test failed',
        severity: 'error',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working': return 'primary';
      case 'completed': return 'success';
      case 'error': return 'error';
      default: return 'grey';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working': return <AutoAwesome />;
      case 'completed': return <CheckCircle />;
      case 'error': return <Error />;
      default: return <SmartToy />;
    }
  };

  return (
    <ThemeProvider theme={md3Theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
          {/* Header */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: 'white',
              borderRadius: 3,
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box flex={1}>
                <Typography variant="h4" gutterBottom>
                  AI Agent Orchestrator
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  Dynamic multi-agent system with intelligent task orchestration
                </Typography>
              </Box>
              <Box>
                <Stack direction="row" spacing={2}>
                  <Tooltip title="Settings">
                    <IconButton color="inherit" onClick={() => setShowSettings(true)}>
                      <Settings />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Test Tools">
                    <IconButton color="inherit" onClick={() => setShowToolTesting(true)}>
                      <Science />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            </Box>
          </Paper>

          {/* Task Input */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Box display="flex" gap={2} alignItems="center">
              <Box flex={1}>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Enter your task"
                  placeholder="e.g., Create a todo app with user authentication"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  multiline
                  rows={2}
                  disabled={isExecuting}
                />
              </Box>
              <Box>
                <Stack spacing={1}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={useDynamicAgents ? <AutoAwesome /> : <Psychology />}
                    onClick={handleOrchestrate}
                    disabled={isExecuting || !task.trim()}
                  >
                    Orchestrate
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    startIcon={isExecuting ? <Stop /> : <PlayArrow />}
                    onClick={isExecuting ? () => setIsExecuting(false) : handleExecute}
                    disabled={!task.trim()}
                  >
                    {isExecuting ? 'Stop' : 'Execute'}
                  </Button>
                </Stack>
              </Box>
            </Box>

            {/* Dynamic Agents Toggle */}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useDynamicAgents}
                    onChange={(e) => setUseDynamicAgents(e.target.checked)}
                  />
                }
                label="Use AI to generate optimal agents"
              />
            </Box>
          </Paper>

          {/* Task Analysis */}
          {taskAnalysis && (
            <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Task Analysis
              </Typography>
              <Box display="flex" gap={2} flexWrap="wrap">
                <Box>
                  <Chip
                    label={`Type: ${taskAnalysis.task_type}`}
                    color="primary"
                    sx={{ width: '100%' }}
                  />
                </Box>
                <Box>
                  <Chip
                    label={`Complexity: ${taskAnalysis.complexity}`}
                    color={taskAnalysis.complexity === 'complex' ? 'error' : 'warning'}
                    sx={{ width: '100%' }}
                  />
                </Box>
                <Box>
                  <Chip
                    label={`Workflow: ${taskAnalysis.suggested_workflow}`}
                    color="secondary"
                    sx={{ width: '100%' }}
                  />
                </Box>
                <Box>
                  <Chip
                    label={`Agents: ${taskAnalysis.estimated_agents}`}
                    icon={<SmartToy />}
                    sx={{ width: '100%' }}
                  />
                </Box>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Domains: {taskAnalysis.domains.join(', ')}
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Main Content Tabs */}
          <Paper elevation={1} sx={{ mb: 3 }}>
            <Tabs
              value={activeTab}
              onChange={(e, v) => setActiveTab(v)}
              indicatorColor="primary"
              textColor="primary"
            >
              <Tab icon={<Hub />} label="Agents" />
              <Tab icon={<Timeline />} label="Execution" />
              <Tab icon={<Extension />} label="Tools" />
              <Tab icon={<Analytics />} label="Metrics" />
            </Tabs>
          </Paper>

          {/* Tab Content */}
          <Box sx={{ mt: 2 }}>
            {/* Agents Tab */}
            {activeTab === 0 && (
              <Box display="flex" gap={3} flexWrap="wrap">
                {agents.map((agent) => (
                  <Box key={agent.id} sx={{ width: { xs: '100%', md: 'calc(50% - 12px)', lg: 'calc(33.33% - 16px)' } }}>
                    <Card
                      elevation={1}
                      sx={{
                        height: '100%',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: 3,
                        },
                      }}
                      onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
                    >
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
                          <Avatar sx={{ 
                            bgcolor: agent.status === 'working' ? theme.palette.primary.main :
                                    agent.status === 'completed' ? theme.palette.success.main :
                                    agent.status === 'error' ? theme.palette.error.main :
                                    theme.palette.grey[500]
                          }}>
                            {getStatusIcon(agent.status)}
                          </Avatar>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="h6">{agent.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {agent.role}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={agent.status}
                            color={
                              agent.status === 'working' ? 'primary' :
                              agent.status === 'completed' ? 'success' :
                              agent.status === 'error' ? 'error' :
                              'default'
                            }
                          />
                        </Stack>

                        {agent.currentTask && (
                          <Alert severity="info" sx={{ mb: 2 }}>
                            {agent.currentTask}
                          </Alert>
                        )}

                        {agent.status === 'working' && (
                          <Box sx={{ mb: 2 }}>
                            <LinearProgress
                              variant="determinate"
                              value={agent.progress}
                              sx={{ height: 8, borderRadius: 4 }}
                            />
                          </Box>
                        )}

                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Model: {agent.model}
                          </Typography>
                        </Box>

                        <Collapse in={selectedAgent === agent.id}>
                          <Divider sx={{ my: 2 }} />
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Tools ({agent.tools.length}):
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {agent.tools.map((tool) => (
                              <Chip
                                key={tool}
                                size="small"
                                icon={toolIcons[tool] || <Extension />}
                                label={tool}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTestTool(tool);
                                }}
                              />
                            ))}
                          </Stack>
                        </Collapse>
                      </CardContent>
                    </Card>
                  </Box>
                ))}

                {/* Add Agent Button */}
                <Box sx={{ width: { xs: '100%', md: 'calc(50% - 12px)', lg: 'calc(33.33% - 16px)' } }}>
                  <Card
                    elevation={1}
                    sx={{
                      height: 200,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      border: `2px dashed ${theme.palette.divider}`,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    <Stack alignItems="center" spacing={1}>
                      <IconButton color="primary" size="large">
                        <Add />
                      </IconButton>
                      <Typography color="text.secondary">Add Agent</Typography>
                    </Stack>
                  </Card>
                </Box>
              </Box>
            )}

            {/* Execution Tab */}
            {activeTab === 1 && (
              <Paper elevation={1} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Execution Timeline
                </Typography>
                <Stepper orientation="vertical" activeStep={agents.findIndex(a => a.status === 'working')}>
                  {agents.map((agent, index) => (
                    <Step key={agent.id} completed={agent.status === 'completed'}>
                      <StepLabel
                        error={agent.status === 'error'}
                        StepIconComponent={() => (
                          <Avatar
                            sx={{
                              width: 32,
                              height: 32,
                              bgcolor: agent.status === 'working' ? theme.palette.primary.main :
                                      agent.status === 'completed' ? theme.palette.success.main :
                                      agent.status === 'error' ? theme.palette.error.main :
                                      theme.palette.grey[500]
                            }}
                          >
                            {getStatusIcon(agent.status)}
                          </Avatar>
                        )}
                      >
                        {agent.name}
                      </StepLabel>
                      <StepContent>
                        <Typography variant="body2" color="text.secondary">
                          {agent.role}
                        </Typography>
                        {agent.output && (
                          <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.50' }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {agent.output}
                            </Typography>
                          </Paper>
                        )}
                      </StepContent>
                    </Step>
                  ))}
                </Stepper>
              </Paper>
            )}

            {/* Tools Tab */}
            {activeTab === 2 && (
              <Box display="flex" gap={3} flexWrap="wrap">
                {Object.entries(
                  availableTools.reduce((acc, tool) => {
                    if (!acc[tool.category]) acc[tool.category] = [];
                    acc[tool.category].push(tool);
                    return acc;
                  }, {} as Record<string, typeof availableTools>)
                ).map(([category, tools]) => (
                  <Box key={category} sx={{ width: { xs: '100%', md: 'calc(50% - 12px)' } }}>
                    <Paper elevation={1} sx={{ p: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        {category}
                      </Typography>
                      <List dense>
                        {tools.map((tool) => (
                          <ListItem key={tool.name}>
                            <ListItemIcon>
                              {toolIcons[tool.name] || <Extension />}
                            </ListItemIcon>
                            <ListItemText primary={tool.name} />
                            <ListItemSecondaryAction>
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={() => handleTestTool(tool.name)}
                              >
                                <Science />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))}
                      </List>
                    </Paper>
                  </Box>
                ))}
              </Box>
            )}

            {/* Metrics Tab */}
            {activeTab === 3 && (
              <Box display="flex" gap={3} flexWrap="wrap">
                <Box sx={{ flex: 1, minWidth: '300px' }}>
                  <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                    <Speed color="primary" sx={{ fontSize: 48 }} />
                    <Typography variant="h4">0.8s</Typography>
                    <Typography color="text.secondary">Avg Response Time</Typography>
                  </Paper>
                </Box>
                <Box sx={{ flex: 1, minWidth: '300px' }}>
                  <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                    <CheckCircle color="success" sx={{ fontSize: 48 }} />
                    <Typography variant="h4">95%</Typography>
                    <Typography color="text.secondary">Success Rate</Typography>
                  </Paper>
                </Box>
                <Box sx={{ flex: 1, minWidth: '300px' }}>
                  <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                    <Memory color="secondary" sx={{ fontSize: 48 }} />
                    <Typography variant="h4">12 MB</Typography>
                    <Typography color="text.secondary">Memory Usage</Typography>
                  </Paper>
                </Box>
              </Box>
            )}
          </Box>

          {/* Tool Testing Dialog */}
          <Dialog
            open={showToolTesting}
            onClose={() => setShowToolTesting(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Tool Testing Interface</DialogTitle>
            <DialogContent>
              <List>
                {toolTests.map((test, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      {test.status === 'success' ? (
                        <CheckCircle color="success" />
                      ) : (
                        <Error color="error" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={test.tool_name}
                      secondary={`${test.execution_time.toFixed(2)}ms - ${test.timestamp}`}
                    />
                  </ListItem>
                ))}
              </List>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowToolTesting(false)}>Close</Button>
            </DialogActions>
          </Dialog>

          {/* Notification Snackbar */}
          <Snackbar
            open={notification.open}
            autoHideDuration={6000}
            onClose={() => setNotification({ ...notification, open: false })}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          >
            <Alert
              onClose={() => setNotification({ ...notification, open: false })}
              severity={notification.severity}
              sx={{ width: '100%' }}
            >
              {notification.message}
            </Alert>
          </Snackbar>
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default ModernDashboard;