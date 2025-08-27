import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Typography,
  TextField,
  Button,
  Menu,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
  Tooltip,
  Divider,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Chat as ChatIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Delete as DeleteIcon,
  FileCopy as FileCopyIcon,
  Edit as EditIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { useChatSessions } from '../hooks/useChatSessions';
import { ChatSessionSummary } from '../services/chatApi';

interface ChatSessionSidebarProps {
  onSessionSelect: (sessionId: string) => void;
  currentSessionId: string | null;
}

const ChatSessionSidebar: React.FC<ChatSessionSidebarProps> = ({
  onSessionSelect,
  currentSessionId,
}) => {
  const {
    sessions,
    loading,
    error,
    createSession,
    deleteSession,
    duplicateSession,
    archiveSession,
    restoreSession,
    updateSession,
    includeArchived,
    setIncludeArchived,
    refreshSessions,
  } = useChatSessions();

  const [searchQuery, setSearchQuery] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedSession, setSelectedSession] = useState<ChatSessionSummary | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');

  // Filter sessions based on search query
  const filteredSessions = sessions.filter(session =>
    !searchQuery ||
    session.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.session_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, session: ChatSessionSummary) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedSession(session);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedSession(null);
  };

  const handleCreateSession = async () => {
    try {
      const newSession = await createSession({
        title: newSessionTitle || undefined,
        description: newSessionDescription || undefined,
      });
      setNewSessionDialogOpen(false);
      setNewSessionTitle('');
      setNewSessionDescription('');
      onSessionSelect(newSession.session_id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleEditSession = async () => {
    if (!selectedSession) return;
    
    try {
      await updateSession(selectedSession.session_id, {
        title: editTitle,
      });
      setEditDialogOpen(false);
      setEditTitle('');
      handleMenuClose();
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    
    try {
      await deleteSession(selectedSession.session_id);
      setDeleteConfirmOpen(false);
      handleMenuClose();
      if (currentSessionId === selectedSession.session_id) {
        // If we deleted the current session, select the first available one
        const remainingSessions = sessions.filter(s => s.session_id !== selectedSession.session_id);
        if (remainingSessions.length > 0) {
          onSessionSelect(remainingSessions[0].session_id);
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleDuplicateSession = async () => {
    if (!selectedSession) return;
    
    try {
      const newSession = await duplicateSession(selectedSession.session_id);
      handleMenuClose();
      onSessionSelect(newSession.session_id);
    } catch (error) {
      console.error('Failed to duplicate session:', error);
    }
  };

  const handleArchiveSession = async () => {
    if (!selectedSession) return;
    
    try {
      if (selectedSession.is_archived) {
        await restoreSession(selectedSession.session_id);
      } else {
        await archiveSession(selectedSession.session_id);
      }
      handleMenuClose();
    } catch (error) {
      console.error('Failed to archive/restore session:', error);
    }
  };

  const openEditDialog = () => {
    if (selectedSession) {
      setEditTitle(selectedSession.title || '');
      setEditDialogOpen(true);
    }
    handleMenuClose();
  };

  const openDeleteConfirm = () => {
    setDeleteConfirmOpen(true);
    handleMenuClose();
  };

  return (
    <Box sx={{ width: 320, height: '100vh', borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" component="div">
            Chat Sessions
          </Typography>
          <Tooltip title="New Session">
            <IconButton
              size="small"
              onClick={() => setNewSessionDialogOpen(true)}
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          sx={{ mb: 1 }}
        />

        {/* Filters */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Show archived
              </Typography>
            }
          />
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={refreshSessions}>
              <FilterIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Session List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Loading sessions...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Box>
        ) : filteredSessions.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {searchQuery ? 'No sessions found' : 'No sessions yet'}
            </Typography>
          </Box>
        ) : (
          <List dense>
            {filteredSessions.map((session) => (
              <ListItem
                key={session.session_id}
                disablePadding
                sx={{
                  borderLeft: currentSessionId === session.session_id ? 3 : 0,
                  borderColor: 'primary.main',
                  bgcolor: currentSessionId === session.session_id 
                    ? alpha('rgba(25, 118, 210, 0.08)', 0.5)
                    : 'transparent',
                }}
              >
                <ListItemButton
                  onClick={() => onSessionSelect(session.session_id)}
                  sx={{ 
                    pr: 1,
                    '&:hover': {
                      bgcolor: alpha('rgba(0, 0, 0, 0.04)', 0.5),
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <ChatIcon fontSize="small" color={session.is_archived ? 'disabled' : 'action'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="body2"
                          fontWeight={currentSessionId === session.session_id ? 600 : 400}
                          color={session.is_archived ? 'text.disabled' : 'text.primary'}
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {session.title || 'Untitled Session'}
                        </Typography>
                        {session.is_archived && (
                          <Chip
                            label="Archived"
                            size="small"
                            variant="outlined"
                            sx={{ height: 16, fontSize: '0.6rem' }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {session.message_count} messages
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {session.last_message_at 
                            ? formatDistanceToNow(new Date(session.last_message_at), { addSuffix: true })
                            : formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
                          }
                        </Typography>
                      </Box>
                    }
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuClick(e, session)}
                    sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 200 }
        }}
      >
        <MenuItem onClick={openEditDialog}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Title</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDuplicateSession}>
          <ListItemIcon>
            <FileCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleArchiveSession}>
          <ListItemIcon>
            {selectedSession?.is_archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>
            {selectedSession?.is_archived ? 'Restore' : 'Archive'}
          </ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={openDeleteConfirm} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* New Session Dialog */}
      <Dialog open={newSessionDialogOpen} onClose={() => setNewSessionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Session</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Session Title"
            fullWidth
            variant="outlined"
            value={newSessionTitle}
            onChange={(e) => setNewSessionTitle(e.target.value)}
            placeholder="Enter a title for your session..."
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={newSessionDescription}
            onChange={(e) => setNewSessionDescription(e.target.value)}
            placeholder="Describe what this session is for..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewSessionDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateSession} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Session Title</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Session Title"
            fullWidth
            variant="outlined"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleEditSession} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Session</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedSession?.title || 'Untitled Session'}"? 
            This action cannot be undone and will delete all messages in this session.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteSession} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatSessionSidebar;