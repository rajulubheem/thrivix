import React from 'react';
import { HelpCircle, ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface FollowUpQuestionsProps {
  questions: string[];
  onSelectQuestion: (question: string) => void;
}

export default function FollowUpQuestions({ questions, onSelectQuestion }: FollowUpQuestionsProps) {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Explore Further
        </h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {questions.map((question, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectQuestion(question)}
            className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm hover:shadow-md transition-all text-left group"
          >
            <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
              {question}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}