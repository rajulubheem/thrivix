import React, { useState } from 'react';
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
  Switch,
  FormControlLabel,
  Stack,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';

import {
  PlayArrow,
  Stop,
  Settings,
  Psychology,
  CheckCircle,
  Error,
  Add,
  Delete,
  Edit,
  Terminal,
  Storage,
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
  Search,
  Description,
  FolderOpen,
  Email,
  Calculate
} from '@mui/icons-material';

// Create Material Design 3 theme
const md3Theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#006494',
    },
    secondary: {
      main: '#546e7a',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
  },
});

const ModernDashboardDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [task, setTask] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' as any });

  // Demo orchestration
  const handleOrchestrate = () => {
    if (!task.trim()) return;

    // Simulate AI orchestration
    const demoAgents = [
      {
        id: 'agent-1',
        name: 'requirements_analyst',
        role: 'Analyze and document requirements',
        status: 'idle',
        tools: ['file_read', 'file_write', 'web_search'],
        model: 'gpt-4o-mini',
        progress: 0,
      },
      {
        id: 'agent-2',
        name: 'solution_architect',
        role: 'Design system architecture',
        status: 'idle',
        tools: ['diagram_create', 'file_write', 'code_review'],
        model: 'gpt-4o',
        progress: 0,
      },
      {
        id: 'agent-3',
        name: 'developer',
        role: 'Implement the solution',
        status: 'idle',
        tools: ['code_write', 'file_write', 'terminal'],
        model: 'gpt-4o',
        progress: 0,
      },
    ];

    setAgents(demoAgents);
    setNotification({
      open: true,
      message: `Generated ${demoAgents.length} agents for your task (Demo Mode)`,
      severity: 'success',
    });
  };

  const handleExecute = () => {
    if (agents.length === 0) {
      handleOrchestrate();
      return;
    }

    setIsExecuting(true);
    
    // Simulate execution
    agents.forEach((agent, index) => {
      setTimeout(() => {
        setAgents(prev => prev.map(a => 
          a.id === agent.id 
            ? { ...a, status: 'working', progress: 50, currentTask: 'Processing task...' }
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
        message: 'Task execution completed (Demo)',
        severity: 'success',
      });
    }, agents.length * 2000 + 3000);
  };

  return (
    <ThemeProvider theme={md3Theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
        <Container maxWidth="xl">
          {/* Demo Banner */}
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Demo Mode:</strong> This is a demonstration of the AI Orchestrator interface. 
              Backend connection not required for this demo.
            </Typography>
          </Alert>

          {/* Header */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              background: 'linear-gradient(135deg, #006494 0%, #003d66 100%)',
              color: 'white',
              borderRadius: 3,
            }}
          >
            <Typography variant="h4" gutterBottom>
              AI Agent Orchestrator - Demo
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Dynamic agent generation based on task analysis
            </Typography>
          </Paper>

          {/* Task Input */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box sx={{ flexGrow: 1 }}>
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
                    startIcon={<AutoAwesome />}
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
          </Paper>

          {/* Tabs */}
          <Paper elevation={1} sx={{ mb: 3 }}>
            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
              <Tab icon={<Hub />} label="Agents" />
              <Tab icon={<Timeline />} label="Execution" />
              <Tab icon={<Extension />} label="Tools" />
            </Tabs>
          </Paper>

          {/* Tab Content */}
          <Box sx={{ mt: 2 }}>
            {/* Agents Tab */}
            {activeTab === 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 3 }}>
                {agents.map((agent) => (
                  <Box key={agent.id}>
                    <Card elevation={1}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
                          <Avatar sx={{ 
                            bgcolor: agent.status === 'working' ? '#006494' :
                                    agent.status === 'completed' ? '#2e7d32' :
                                    '#9e9e9e'
                          }}>
                            <SmartToy />
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
                          <LinearProgress
                            variant="determinate"
                            value={agent.progress}
                            sx={{ mb: 2, height: 8, borderRadius: 4 }}
                          />
                        )}

                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Model: {agent.model}
                        </Typography>
                        
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {agent.tools.map((tool: string) => (
                            <Chip key={tool} size="small" label={tool} />
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Box>
                ))}

                {agents.length === 0 && (
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <Paper sx={{ p: 4, textAlign: 'center' }}>
                      <SmartToy sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary">
                        No agents generated yet
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Enter a task and click "Orchestrate" to generate agents
                      </Typography>
                    </Paper>
                  </Box>
                )}
              </Box>
            )}

            {/* Execution Tab */}
            {activeTab === 1 && (
              <Paper elevation={1} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Execution Timeline
                </Typography>
                {agents.length > 0 ? (
                  <Stepper orientation="vertical" activeStep={agents.findIndex(a => a.status === 'working')}>
                    {agents.map((agent) => (
                      <Step key={agent.id} completed={agent.status === 'completed'}>
                        <StepLabel>{agent.name}</StepLabel>
                        <StepContent>
                          <Typography variant="body2" color="text.secondary">
                            {agent.role}
                          </Typography>
                        </StepContent>
                      </Step>
                    ))}
                  </Stepper>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No execution timeline available
                  </Typography>
                )}
              </Paper>
            )}

            {/* Tools Tab */}
            {activeTab === 2 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3 }}>
                <Box>
                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      File Operations
                    </Typography>
                    <List dense>
                      {['file_read', 'file_write', 'directory_list'].map((tool) => (
                        <ListItem key={tool}>
                          <ListItemIcon><Description /></ListItemIcon>
                          <ListItemText primary={tool} />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Box>
                <Box>
                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      Web Operations
                    </Typography>
                    <List dense>
                      {['web_search', 'web_scrape', 'api_call'].map((tool) => (
                        <ListItem key={tool}>
                          <ListItemIcon><WebAsset /></ListItemIcon>
                          <ListItemText primary={tool} />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Box>
              </Box>
            )}
          </Box>

          {/* Notification */}
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

export default ModernDashboardDemo;