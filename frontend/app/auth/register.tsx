import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows, typography } from '../../constants/theme';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const { register } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters');
      return;
    }
    setIsLoading(true);
    try {
      await register(username.trim(), password);
      router.replace('/onboarding/welcome');
    } catch (error: any) {
      Alert.alert('Registration failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brandText}>EUNOIA</Text>
          </View>

          <Text style={styles.eyebrow}>Create account</Text>
          <Text style={styles.title}>Begin your{"\n"}journey.</Text>
          <Text style={styles.subtitle}>
            A premium AI health companion built for clarity, depth, and trust.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={[styles.inputContainer, focused === 'username' && styles.inputContainerFocused]}>
              <Ionicons name="person-outline" size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="yourname"
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                editable={!isLoading}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused(null)}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputContainer, focused === 'password' && styles.inputContainerFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isLoading}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirm password</Text>
            <View style={[styles.inputContainer, focused === 'confirm' && styles.inputContainerFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Repeat password"
                placeholderTextColor={colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!isLoading}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.9}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Create account</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>EXISTING USER</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/auth/login')}
            disabled={isLoading}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryButtonText}>Sign in</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>
          By continuing you agree to our terms and privacy policy.
        </Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.xxxl,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  brandText: {
    ...typography.overline,
    color: colors.textPrimary,
  },
  eyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: 12,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: 320,
  },
  form: {
    width: '100%',
    gap: spacing.lg,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    ...typography.overline,
    color: colors.textTertiary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: spacing.inputRadius,
    paddingHorizontal: spacing.lg,
    height: 54,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  inputContainerFocused: {
    borderColor: colors.textPrimary,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.buttonRadius,
    height: 54,
    marginTop: spacing.sm,
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    ...typography.overline,
    color: colors.textMuted,
    fontSize: 10,
  },
  secondaryButton: {
    height: 54,
    borderRadius: spacing.buttonRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  footnote: {
    ...typography.captionSmall,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
