import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import { BrandMark, Button, Notice, TextField } from '../../components/ui';
import { colors, fonts, spacing, typography } from '../../constants/theme';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const { register } = useAuth();
  const router = useRouter();

  const edit = (setter: (t: string) => void) => (t: string) => {
    setter(t);
    if (error) setError(null);
  };

  const handleRegister = async () => {
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Fill in all three fields to create your account.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match. Type the same password twice.');
      return;
    }
    if (password.length < 6) {
      setError('Use a password of at least 6 characters.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await register(username.trim(), password);
      router.replace('/onboarding/welcome');
    } catch (e: any) {
      setError(e?.message || 'Could not create your account. Try again in a moment.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScreenScrollView contentContainerStyle={styles.scrollContent}>
        <BrandMark />

        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Create your account
          </Text>
          <Text style={styles.subtitle}>
            Pick a username and password. Next, a few questions build your health profile.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Username"
            icon="person-outline"
            placeholder="Choose a username"
            value={username}
            onChangeText={edit(setUsername)}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
            editable={!isLoading}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            placeholder="At least 6 characters"
            password
            value={password}
            onChangeText={edit(setPassword)}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            submitBehavior="submit"
            editable={!isLoading}
          />
          <TextField
            ref={confirmRef}
            label="Confirm password"
            icon="lock-closed-outline"
            placeholder="Type it again"
            password
            value={confirmPassword}
            onChangeText={edit(setConfirmPassword)}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleRegister}
            editable={!isLoading}
          />

          {error ? <Notice>{error}</Notice> : null}

          <Button label="Create account" onPress={handleRegister} loading={isLoading} style={styles.submit} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account?</Text>
          <Pressable
            onPress={() => router.push('/auth/login')}
            disabled={isLoading}
            hitSlop={12}
            accessibilityRole="link"
          >
            <Text style={styles.switchLink}>Sign in</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreenScrollView>
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
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginTop: 56,
    marginBottom: spacing.xxxl,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: 340,
  },
  form: {
    gap: spacing.xl,
  },
  submit: {
    marginTop: spacing.xs,
  },
  switchRow: {
    marginTop: 'auto',
    paddingTop: spacing.xxxl,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  switchText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  switchLink: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
});
