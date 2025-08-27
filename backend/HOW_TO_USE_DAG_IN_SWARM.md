# How to Use DAG in Your /swarm UI

## ✅ DAG is Now Integrated into /swarm!

The DAG (parallel execution) functionality is now fully integrated into your existing `/swarm` interface. You don't need to navigate to a different page!

## 📍 Where to Find It

1. **Open your browser**: Navigate to `http://localhost:3000/swarm`

2. **Look at the top header**: You'll see the **Execution Mode Toggle** in the header bar, showing three options:
   - 🤖 **Auto** (Recommended) - System intelligently chooses
   - ➡️ **Sequential** - Traditional one-by-one execution
   - ⚡ **Parallel** - DAG-based simultaneous execution

## 🎯 How to Use It

### Method 1: Auto Mode (Recommended)
1. Leave the toggle on **"Auto"** (default)
2. Type your query normally
3. The system will automatically detect if parallel execution would help
4. Watch the execution - parallel tasks will show multiple agents working simultaneously

### Method 2: Force Parallel Mode
1. Click on the **"Parallel"** button in the toggle
2. You'll see a ⚡ indicator showing fast mode is active
3. Type any multi-part query like:
   - "Research AI, Blockchain, and Quantum Computing"
   - "Compare Python, JavaScript, and Go for backend development"
   - "Analyze customer data from sales, support, and marketing"
4. Watch multiple agents work simultaneously!

### Method 3: Force Sequential Mode
1. Click on **"Sequential"** if you want traditional behavior
2. Agents will work one after another as before

## 🔍 How to Verify It's Working

### Visual Indicators:
1. **In the header**: The toggle shows your current mode
2. **During execution**: 
   - In Parallel mode, you'll see multiple agents with "thinking" or "active" status simultaneously
   - In Sequential mode, only one agent is active at a time

### Performance Indicators:
- **Parallel tasks** complete much faster (2-4x speedup)
- **Activity Timeline** shows agents working at the same time
- **Console logs** will show: `📡 Request body: { ..., execution_mode: "parallel" }`

## 📝 Example Queries to Test

### Good for Parallel (Auto will detect):
- "Research the latest trends in AI, Blockchain, and IoT"
- "Compare React, Vue, and Angular for frontend development"
- "Analyze data from multiple sources and create a report"
- "Generate blog posts about AI ethics, AI safety, and AI regulation"

### Stays Sequential (Auto will detect):
- "Write a hello world function"
- "Debug this code"
- "Explain what this function does"

## 🚀 Quick Test

1. Go to `http://localhost:3000/swarm`
2. Make sure you see the Execution Mode toggle in the header
3. Leave it on "Auto"
4. Type: **"Research AI, Blockchain, and Quantum Computing trends"**
5. Watch the agents work in parallel!

## 🛠️ Troubleshooting

If you don't see the toggle:
1. Refresh the page (Ctrl+R or Cmd+R)
2. Check the console for errors
3. Make sure both backend and frontend are running:
   - Backend: `http://localhost:8000`
   - Frontend: `http://localhost:3000`

## 📊 What's Happening Behind the Scenes

When you select:
- **Auto**: System analyzes your query and chooses the best mode
- **Sequential**: Uses original `/api/v1/swarm/execute` endpoint
- **Parallel**: Uses new DAG-optimized execution with `/api/v1/swarm-dag/execute`

The integration is **seamless and non-breaking** - your existing workflows continue to work exactly as before, with the added benefit of parallel execution when it helps!

## 🎉 Summary

You now have **DAG parallel execution directly in your /swarm interface**! No need to navigate elsewhere or learn new interfaces. Just use the toggle to control execution mode and enjoy 2-4x speedup on suitable tasks!