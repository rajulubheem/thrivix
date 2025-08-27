import React from 'react';
import {
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import {
  AutoAwesome as AutoIcon,
  ArrowForward as SequentialIcon,
  AccountTree as ParallelIcon,
} from '@mui/icons-material';

export type ExecutionMode = 'auto' | 'sequential' | 'parallel';

interface ExecutionModeToggleProps {
  value: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
  disabled?: boolean;
  showLabel?: boolean;
}

const ExecutionModeToggle: React.FC<ExecutionModeToggleProps> = ({
  value,
  onChange,
  disabled = false,
  showLabel = true,
}) => {
  const handleChange = (_: React.MouseEvent<HTMLElement>, newMode: ExecutionMode | null) => {
    if (newMode !== null) {
      onChange(newMode);
    }
  };

  const getModeDescription = (mode: ExecutionMode) => {
    switch (mode) {
      case 'auto':
        return 'Automatically choose best execution mode based on task analysis';
      case 'sequential':
        return 'Agents work one after another (traditional mode)';
      case 'parallel':
        return 'Agents work simultaneously when possible (DAG mode)';
      default:
        return '';
    }
  };

  const getModeIcon = (mode: ExecutionMode) => {
    switch (mode) {
      case 'auto':
        return <AutoIcon fontSize="small" />;
      case 'sequential':
        return <SequentialIcon fontSize="small" />;
      case 'parallel':
        return <ParallelIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const getModeColor = (mode: ExecutionMode) => {
    switch (mode) {
      case 'auto':
        return 'primary';
      case 'sequential':
        return 'default';
      case 'parallel':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {showLabel && (
        <Typography variant="body2" color="text.secondary">
          Execution:
        </Typography>
      )}
      
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={handleChange}
        aria-label="execution mode"
        size="small"
        disabled={disabled}
      >
        <Tooltip title={getModeDescription('auto')} arrow>
          <ToggleButton value="auto" aria-label="auto mode">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutoIcon fontSize="small" />
              <Typography variant="caption">Auto</Typography>
            </Box>
          </ToggleButton>
        </Tooltip>

        <Tooltip title={getModeDescription('sequential')} arrow>
          <ToggleButton value="sequential" aria-label="sequential mode">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SequentialIcon fontSize="small" />
              <Typography variant="caption">Sequential</Typography>
            </Box>
          </ToggleButton>
        </Tooltip>

        <Tooltip title={getModeDescription('parallel')} arrow>
          <ToggleButton value="parallel" aria-label="parallel mode">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ParallelIcon fontSize="small" />
              <Typography variant="caption">Parallel</Typography>
            </Box>
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>

      {value === 'parallel' && (
        <Chip 
          label="⚡ Fast" 
          size="small" 
          color="success" 
          variant="outlined"
          sx={{ ml: 1 }}
        />
      )}
      
      {value === 'auto' && (
        <Chip 
          label="🤖 Smart" 
          size="small" 
          color="primary" 
          variant="outlined"
          sx={{ ml: 1 }}
        />
      )}
    </Box>
  );
};

export default ExecutionModeToggle;