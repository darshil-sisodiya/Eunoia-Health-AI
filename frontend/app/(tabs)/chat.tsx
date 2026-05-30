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
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  const [inputFocused, setInputFocused] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
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
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={14} color={colors.textInverse} />
          </View>
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
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={14} color={colors.textPrimary} />
          </View>
        )}
        {!showAvatar && isUser && <View style={styles.avatarSpacer} />}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* ── Editorial header ─────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerEyebrow}>EUNOIA · ASSISTANT</Text>
            <Text style={styles.headerTitle}>Health AI</Text>
          </View>
          <View style={styles.headerStatus}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </View>

        <View style={styles.headerRule} />

        {/* ── Prescription chips ───────────────────────────── */}
        {prescriptions.length > 0 && (
          <View style={styles.prescriptionsBar}>
            <Text style={styles.prescriptionsLabel}>Reference</Text>
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
                        ? `${prev}\n\nReference: ${item.medication_name}`
                        : `Reference my prescription: ${item.medication_name}`
                    )
                  }
                  activeOpacity={0.85}
                >
                  <View style={styles.prescriptionChipDot} />
                  <Text style={styles.prescriptionChipText} numberOfLines={1}>
                    {item.medication_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* ── Chat body ────────────────────────────────────── */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.chatWrapper}>
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="sparkles-outline" size={28} color={colors.textPrimary} />
                </View>
                <Text style={styles.emptyEyebrow}>NEW CONVERSATION</Text>
                <Text style={styles.emptyText}>How can I help today?</Text>
                <Text style={styles.emptySubtext}>
                  Ask anything about your health, prescriptions, or wellness routine.
                </Text>
                <View style={styles.examplesContainer}>
                  {[
                    { text: 'Tell me about my health profile', icon: 'person-circle-outline' as const },
                    { text: 'How can I improve my sleep?', icon: 'moon-outline' as const },
                    { text: 'Reduce stress naturally', icon: 'leaf-outline' as const },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.text}
                      style={styles.exampleCard}
                      onPress={() => setInputText(item.text)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.exampleIcon}>
                        <Ionicons name={item.icon} size={16} color={colors.textPrimary} />
                      </View>
                      <Text style={styles.exampleText}>{item.text}</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  ))}
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

          {/* ── Input ─────────────────────────────────────── */}
          <View
            style={[
              styles.inputOuter,
              keyboardVisible && styles.inputOuterKeyboard,
            ]}
          >
            <View style={[styles.inputContainer, inputFocused && styles.inputContainerFocused]}>
              <TextInput
                style={styles.input}
                placeholder="Message Health AI…"
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                editable={!isSending}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.9}
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isSending) && styles.sendButtonDisabled,
                ]}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={!inputText.trim() ? colors.textMuted : colors.textInverse}
                  />
                )}
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
    backgroundColor: colors.background,
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

  // ─── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerLeft: {},
  headerEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  headerTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginTop: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerRule: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.screenPadding,
  },

  // ─── Prescription chips ──────────────────────────────────
  prescriptionsBar: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  prescriptionsLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 10,
  },
  prescriptionsList: {
    gap: spacing.sm,
  },
  prescriptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 8,
    maxWidth: 220,
  },
  prescriptionChipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  prescriptionChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // ─── Chat body ───────────────────────────────────────────
  keyboardAvoid: {
    flex: 1,
  },
  chatWrapper: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.xxxl,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  emptyEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 10,
  },
  emptyText: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    marginBottom: spacing.xxxl,
    textAlign: 'center',
    maxWidth: 280,
  },
  examplesContainer: {
    width: '100%',
    gap: spacing.md,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.md,
  },
  exampleIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  exampleText: {
    flex: 1,
    ...typography.callout,
    color: colors.textPrimary,
  },

  // ─── Messages ────────────────────────────────────────────
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
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: colors.inkSurface,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  avatarSpacer: {
    width: 28,
    marginHorizontal: spacing.sm,
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.inkSurface,
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  userText: {
    color: colors.textInverse,
    ...typography.body,
  },

  // ─── Input ───────────────────────────────────────────────
  inputOuter: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: 96,
    backgroundColor: colors.background,
  },
  inputOuterKeyboard: {
    // When the keyboard is up the floating tab bar is hidden (Android)
    // or pushed off-screen by KeyboardAvoidingView (iOS), so collapse
    // the bottom padding that normally clears the tab bar.
    paddingBottom: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  inputContainerFocused: {
    borderColor: colors.textPrimary,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkSurface,
  },
  sendButtonDisabled: {
    backgroundColor: colors.backgroundTertiary,
  },
});
