import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  Keyboard,
  useWindowDimensions,
  type KeyboardEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { MarkdownText } from '../../components/MarkdownText';
import { tap } from '../../components/ui';
import { colors, fonts, spacing, typography } from '../../constants/theme';

const BACKEND_URL = API_BASE_URL;

const SUGGESTIONS = [
  'Tell me about my health profile',
  'How can I improve my sleep?',
  'Ways to reduce stress naturally',
  'Can I take my medicines together?',
];

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
  const tabBarHeight = useBottomTabBarHeight();
  const { height: windowHeight } = useWindowDimensions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [composerHeight, setComposerHeight] = useState(72);
  const [keyboardFrame, setKeyboardFrame] = useState({
    visible: false,
    screenY: 0,
    height: 0,
  });

  // The screen ends at the top of the docked tab bar. With the keyboard
  // open, the composer has to rise by however much of the keyboard reaches
  // above that edge. iOS keeps the tab bar mounted under the keyboard, so
  // its height is already "clear"; Android hides it (tabBarHideOnKeyboard)
  // and the screen then extends to the window bottom.
  const keyboardTop =
    keyboardFrame.screenY > 0
      ? keyboardFrame.screenY
      : windowHeight - keyboardFrame.height;
  const keyboardOverlap = keyboardFrame.visible
    ? Math.max(0, Math.min(keyboardFrame.height, windowHeight - keyboardTop))
    : 0;
  const composerBottom = keyboardFrame.visible
    ? Math.max(0, keyboardOverlap - (Platform.OS === 'ios' ? tabBarHeight : 0))
    : 0;
  const reservedComposerSpace = composerHeight + composerBottom + spacing.lg;
  const canSend = !!inputText.trim() && !isSending;

  const syncKeyboardMetrics = () => {
    // Not implemented on react-native-web.
    const metrics = typeof Keyboard.metrics === 'function' ? Keyboard.metrics() : undefined;
    if (!metrics) return;
    setKeyboardFrame({
      visible: true,
      screenY: metrics.screenY,
      height: metrics.height,
    });
  };

  useEffect(() => {
    const handleKeyboardShow = (event: KeyboardEvent) => {
      setKeyboardFrame({
        visible: true,
        screenY: event.endCoordinates.screenY,
        height: event.endCoordinates.height,
      });
    };
    const handleKeyboardHide = () => {
      setKeyboardFrame({ visible: false, screenY: 0, height: 0 });
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      handleKeyboardShow,
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      handleKeyboardHide,
    );
    const frameSub =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillChangeFrame', handleKeyboardShow)
        : null;
    return () => {
      showSub.remove();
      hideSub.remove();
      frameSub?.remove();
    };
  }, []);

  // Wait for the stored token; on a cold start it is null at mount.
  useEffect(() => {
    if (token) loadChatHistory();
  }, [token]);

  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (keyboardFrame.visible) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [keyboardFrame.visible]);

  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 50);
    }
  }, [reservedComposerSpace, isLoading]);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(response.data?.messages ?? []);
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

  // `text` lets a suggestion chip send straight away; otherwise the draft is sent.
  const handleSend = async (text?: string) => {
    const userMessage = (text ?? inputText).trim();
    if (!userMessage || isSending) return;
    if (text === undefined) setInputText('');
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
          content: 'That message did not go through. Check your connection and send it again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) =>
    item.role === 'user' ? (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText} selectable>
          {item.content}
        </Text>
      </View>
    ) : (
      <View style={[styles.bubble, styles.aiBubble]}>
        <MarkdownText content={item.content} variant="light" />
      </View>
    );

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
        {/* ── Header ───────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Ask Eunoia
          </Text>
          <Text style={styles.headerSubtitle}>Answers that take your health profile into account.</Text>
        </View>

        {/* ── Prescription chips ───────────────────────────── */}
        {prescriptions.length > 0 && (
          <View style={styles.prescriptionsBar}>
            <Text style={styles.prescriptionsLabel}>Ask about a prescription</Text>
            <FlatList
              horizontal
              data={prescriptions}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                  onPress={() => {
                    tap();
                    setInputText((prev) =>
                      prev
                        ? `${prev}\n\nReference: ${item.medication_name}`
                        : `Reference my prescription: ${item.medication_name}`
                    );
                  }}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.medication_name} to your message`}
                >
                  <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {item.medication_name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* ── Chat body ────────────────────────────────────── */}
        <View style={styles.chatWrapper}>
          {messages.length === 0 ? (
            <ScrollView
              contentContainerStyle={[styles.emptyContainer, { paddingBottom: reservedComposerSpace }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.emptyTitle}>What would you like to know?</Text>
              <Text style={styles.emptySubtext}>
                Ask about symptoms, your prescriptions or your daily routine. Try one of these to start.
              </Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((text) => (
                  <Pressable
                    key={text}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                    onPress={() => {
                      tap();
                      handleSend(text);
                    }}
                    disabled={isSending}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask: ${text}`}
                  >
                    <Text style={styles.suggestionText}>{text}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(_, index) => index.toString()}
              contentContainerStyle={[styles.chatContent, { paddingBottom: reservedComposerSpace }]}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                isSending ? (
                  <View style={[styles.bubble, styles.aiBubble, styles.thinking]} accessibilityLiveRegion="polite">
                    <ActivityIndicator size="small" color={colors.textTertiary} />
                    <Text style={styles.thinkingText}>Eunoia is thinking…</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {/* ── Composer ──────────────────────────────────── */}
        <View
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height);
            setComposerHeight((current) =>
              Math.abs(current - nextHeight) > 1 ? nextHeight : current,
            );
          }}
          style={[styles.composer, { bottom: composerBottom }]}
        >
          <View style={[styles.inputContainer, inputFocused && styles.inputContainerFocused]}>
            <TextInput
              style={styles.input}
              placeholder="Ask about your health…"
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              editable={!isSending}
              accessibilityLabel="Message"
              onFocus={() => {
                setInputFocused(true);
                syncKeyboardMetrics();
              }}
              onBlur={() => setInputFocused(false)}
            />
            <Pressable
              onPress={() => {
                tap();
                handleSend();
              }}
              disabled={!canSend}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend, busy: isSending }}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={canSend ? colors.textInverse : colors.textMuted}
                />
              )}
            </Pressable>
          </View>
        </View>
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
    position: 'relative',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },

  // ─── Header ──────────────────────────────────────────────
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // ─── Prescription chips ──────────────────────────────────
  prescriptionsBar: {
    paddingBottom: spacing.sm,
  },
  prescriptionsLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing.sm,
  },
  chipRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.screenPadding,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    gap: 6,
    maxWidth: 220,
  },
  chipText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },

  // ─── Chat body ───────────────────────────────────────────
  chatWrapper: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestion: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
  },
  suggestionText: {
    ...typography.callout,
    color: colors.textPrimary,
  },

  // ─── Messages ────────────────────────────────────────────
  bubble: {
    borderRadius: 20,
    marginBottom: spacing.md,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.inkSurface,
    borderBottomRightRadius: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    paddingHorizontal: spacing.lg,
    // Markdown paragraphs carry their own 10px bottom margin.
    paddingTop: spacing.md,
    paddingBottom: 2,
  },
  userText: {
    ...typography.body,
    color: colors.textInverse,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  thinkingText: {
    ...typography.callout,
    color: colors.textTertiary,
  },

  // ─── Composer ────────────────────────────────────────────
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: spacing.lg,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  inputContainerFocused: {
    borderColor: colors.textPrimary,
  },
  input: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 8,
    color: colors.textPrimary,
    ...typography.body,
    maxHeight: 120,
    marginRight: spacing.sm,
    outlineStyle: 'none',
  } as any,
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkSurface,
  },
  sendButtonDisabled: {
    backgroundColor: colors.backgroundTertiary,
  },
});
