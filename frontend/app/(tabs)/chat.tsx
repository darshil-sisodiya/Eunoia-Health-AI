import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { MarkdownText } from '../../components/MarkdownText';
import { colors, spacing, shadows, typography } from '../../constants/theme';

const BACKEND_URL = API_BASE_URL;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PrescriptionItem {
  id: string;
  medication_name: string;
  dosage?: string | null;
  frequency?: string | null;
  timing?: string | null;
  created_at: string;
}

export default function Chat() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);

  useEffect(() => {
    loadChatHistory();
  }, []);

  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages.length, isLoading]);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(response.data.messages);
      try {
        const presRes = await axios.get(`${BACKEND_URL}/api/prescriptions/history?limit=5`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const items: PrescriptionItem[] = (presRes.data || []).map((p: any) => ({
          id: String(p.id),
          medication_name: String(p.medication_name || 'Unknown'),
          dosage: p.dosage ?? null,
          frequency: p.frequency ?? null,
          timing: p.timing ?? null,
          created_at: p.created_at,
        }));
        setPrescriptions(items);
      } catch (e) {}
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const userMessage = inputText.trim();
    setInputText('');

    const tempUserMsg: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    setIsSending(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/chat/message`,
        { message: userMessage },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMessages((prev) => [...prev, response.data]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    const showAvatar = index === 0 || messages[index - 1].role !== item.role;

    return (
      <View style={[styles.messageContainer, isUser ? styles.userMessageContainer : styles.aiMessageContainer]}>
        {showAvatar && !isUser && (
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={16} color={colors.accent} />
          </LinearGradient>
        )}
        {!showAvatar && !isUser && <View style={styles.avatarSpacer} />}

        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {isUser ? (
            <Text style={styles.userText}>{item.content}</Text>
          ) : (
            <MarkdownText content={item.content} variant="light" />
          )}
        </View>

        {showAvatar && isUser && (
          <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.userAvatar}>
            <Ionicons name="person" size={16} color="#fff" />
          </LinearGradient>
        )}
        {!showAvatar && isUser && <View style={styles.avatarSpacer} />}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient colors={['#4F46E5', '#6366F1', '#818CF8']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="sparkles" size={24} color="#fff" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Health AI</Text>
            <Text style={styles.headerSubtitle}>Your personal health assistant</Text>
          </View>
          <View style={styles.headerStatus}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </LinearGradient>

        {/* Prescription chips */}
        {prescriptions.length > 0 && (
          <View style={styles.prescriptionsBar}>
            <Text style={styles.prescriptionsLabel}>Quick reference:</Text>
            <FlatList
              horizontal
              data={prescriptions}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.prescriptionsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.prescriptionChip}
                  onPress={() =>
                    setInputText((prev) =>
                      prev
                        ? `${prev} \n\nPlease reference my prescription: ${item.medication_name}`
                        : `Please reference my prescription: ${item.medication_name}`
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons name="medical" size={12} color={colors.accent} />
                  <Text style={styles.prescriptionChipText} numberOfLines={1}>
                    {item.medication_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Chat body */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={styles.chatWrapper}>
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.emptyIconWrap}>
                  <Ionicons name="chatbubbles" size={48} color={colors.accent} />
                </LinearGradient>
                <Text style={styles.emptyText}>Start a conversation</Text>
                <Text style={styles.emptySubtext}>Ask me anything about your health</Text>
                <View style={styles.examplesContainer}>
                  <TouchableOpacity
                    style={styles.exampleCard}
                    onPress={() => setInputText('What can you tell me about my health profile?')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.exampleIcon}>
                      <Ionicons name="person-circle-outline" size={20} color={colors.accent} />
                    </View>
                    <Text style={styles.exampleText}>What can you tell me about my health profile?</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.exampleCard}
                    onPress={() => setInputText('Give me tips to improve my sleep')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.exampleIcon}>
                      <Ionicons name="moon-outline" size={20} color={colors.accent} />
                    </View>
                    <Text style={styles.exampleText}>Give me tips to improve my sleep</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.exampleCard}
                    onPress={() => setInputText('How can I reduce stress naturally?')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.exampleIcon}>
                      <Ionicons name="leaf-outline" size={20} color={colors.accent} />
                    </View>
                    <Text style={styles.exampleText}>How can I reduce stress naturally?</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(_, index) => index.toString()}
                contentContainerStyle={styles.chatContent}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>

          {/* Input */}
          <View style={styles.inputOuter}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Type your message..."
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                editable={!isSending}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={!inputText.trim() || isSending ? ['#E2E8F0', '#CBD5E1'] : ['#4F46E5', '#6366F1']}
                  style={styles.sendButton}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.accent,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 16,
    gap: spacing.md,
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    ...typography.title,
    fontSize: 20,
    color: '#fff',
  },
  headerSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statusText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: '#fff',
  },
  keyboardAvoid: {
    flex: 1,
  },
  chatWrapper: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: 18,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emptyText: {
    ...typography.title,
    color: colors.textPrimary,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xxxl,
  },
  examplesContainer: {
    width: '100%',
    gap: spacing.md,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.md,
    ...shadows.sm,
  },
  exampleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleText: {
    flex: 1,
    ...typography.callout,
    color: colors.textSecondary,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  avatarSpacer: {
    width: 32,
    marginHorizontal: spacing.sm,
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    backgroundColor: colors.backgroundSecondary,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  userText: {
    color: '#fff',
    ...typography.body,
  },
  inputOuter: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: 88,
    backgroundColor: colors.background,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.md,
  },
  prescriptionsBar: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  prescriptionsLabel: {
    ...typography.overline,
    color: colors.textMuted,
    marginBottom: 8,
  },
  prescriptionsList: {
    gap: spacing.sm,
  },
  prescriptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 6,
    maxWidth: 200,
    ...shadows.sm,
  },
  prescriptionChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 10,
    color: colors.textPrimary,
    ...typography.body,
    maxHeight: 120,
    marginRight: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
