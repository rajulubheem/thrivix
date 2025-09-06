import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Save, Moon, Sun, Globe, Key, 
  Info, Check, Settings
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { ModernLayout } from '../components/layout/ModernLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isSaved, setIsSaved] = useState(false);
  
  const [settings, setSettings] = useState({
    apiKeys: {
      openai: localStorage.getItem('openai_api_key') || '',
      tavily: localStorage.getItem('tavily_api_key') || ''
    },
    preferences: {
      language: localStorage.getItem('language') || 'en',
      autoSave: localStorage.getItem('auto_save') === 'true',
      notifications: localStorage.getItem('notifications') === 'true'
    }
  });

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem('openai_api_key', settings.apiKeys.openai);
    localStorage.setItem('tavily_api_key', settings.apiKeys.tavily);
    localStorage.setItem('language', settings.preferences.language);
    localStorage.setItem('auto_save', String(settings.preferences.autoSave));
    localStorage.setItem('notifications', String(settings.preferences.notifications));
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <ModernLayout>
      <ScrollArea className="h-full">
        <div className="flex-1 space-y-6 p-8 pt-6 max-w-4xl mx-auto">
          {/* Settings Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Settings className="h-8 w-8 text-primary" />
                Settings
              </h1>
              <p className="text-muted-foreground">
                Manage your account settings and preferences
              </p>
            </div>
            <Button
              onClick={handleSave}
              className={isSaved ? 'bg-green-600 hover:bg-green-700' : ''}
              disabled={isSaved}
            >
              {isSaved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaved ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>

          <Separator />

          <div className="grid gap-6">
            {/* Appearance Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize the appearance of the application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Theme</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose your preferred color theme
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="theme-toggle" className="text-sm">
                      {theme === 'dark' ? 'Dark' : 'Light'}
                    </Label>
                    <Switch
                      id="theme-toggle"
                      checked={theme === 'dark'}
                      onCheckedChange={toggleTheme}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API Configuration Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Configuration
                  <Badge variant="secondary">Required</Badge>
                </CardTitle>
                <CardDescription>
                  Configure your API keys for AI features
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="openai-key">OpenAI API Key</Label>
                  <Input
                    id="openai-key"
                    type="password"
                    value={settings.apiKeys.openai}
                    onChange={(e) => setSettings({
                      ...settings,
                      apiKeys: { ...settings.apiKeys, openai: e.target.value }
                    })}
                    placeholder="sk-..."
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Required for AI responses and analysis
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tavily-key">Tavily API Key</Label>
                  <Input
                    id="tavily-key"
                    type="password"
                    value={settings.apiKeys.tavily}
                    onChange={(e) => setSettings({
                      ...settings,
                      apiKeys: { ...settings.apiKeys, tavily: e.target.value }
                    })}
                    placeholder="tvly-..."
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Required for web search functionality
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Preferences Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Preferences
                </CardTitle>
                <CardDescription>
                  Customize your application preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="language-select">Language</Label>
                  <Select
                    value={settings.preferences.language}
                    onValueChange={(value) => setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, language: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Select your preferred language
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Auto-save</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically save conversations
                    </p>
                  </div>
                  <Switch
                    checked={settings.preferences.autoSave}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, autoSave: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications for completed tasks
                    </p>
                  </div>
                  <Switch
                    checked={settings.preferences.notifications}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, notifications: checked }
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* About Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  About
                </CardTitle>
                <CardDescription>
                  Information about Thrivix Platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="font-semibold">Thrivix Platform</p>
                  <p className="text-sm text-muted-foreground">Version 2.0.0</p>
                  <p className="text-sm text-muted-foreground">
                    Built with React, TypeScript, and powered by Strands AI SDK
                  </p>
                </div>
                <Separator />
                <div className="flex items-center space-x-4 text-sm">
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    GitHub
                  </a>
                  <span className="text-muted-foreground">•</span>
                  <a
                    href="/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Documentation
                  </a>
                  <span className="text-muted-foreground">•</span>
                  <a
                    href="/support"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Support
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </ModernLayout>
  );
};

export default SettingsPage;