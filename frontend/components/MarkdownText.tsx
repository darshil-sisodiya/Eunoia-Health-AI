import React from 'react';
import Markdown, { MarkdownProps } from 'react-native-markdown-display';
import { Platform } from 'react-native';

type MarkdownVariant = 'light' | 'dark';

const baseStyles: MarkdownProps['style'] = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0F172A',
  },
  strong: {
    fontWeight: '700',
    color: '#0F172A',
  },
  em: {
    fontStyle: 'italic',
    color: '#334155',
  },
  paragraph: {
    marginBottom: 8,
  },
  heading1: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    color: '#0F172A',
  },
  heading2: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    color: '#0F172A',
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1E293B',
  },
  bullet_list: {
    marginVertical: 8,
  },
  ordered_list: {
    marginVertical: 8,
  },
  list_item: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  bullet_list_icon: {
    color: '#4F46E5',
  },
  ordered_list_icon: {
    color: '#4F46E5',
  },
  code_inline: {
    backgroundColor: '#F1F5F9',
    color: '#4338CA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  code_block: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fence: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  link: {
    color: '#4F46E5',
  },
};

const variants: Record<MarkdownVariant, MarkdownProps['style']> = {
  light: {
    // Light variant = dark text on light bg (default, nothing to override)
  },
  dark: {
    // Dark variant = light text on dark bg (used inside user-bubble or dark surfaces)
    body: {
      color: '#F8FAFC',
    },
    strong: {
      color: '#FFFFFF',
    },
    em: {
      color: '#CBD5E1',
    },
    heading1: {
      color: '#FFFFFF',
    },
    heading2: {
      color: '#F1F5F9',
    },
    heading3: {
      color: '#E2E8F0',
    },
    code_inline: {
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
      color: '#C7D2FE',
    },
    code_block: {
      backgroundColor: 'rgba(15, 23, 42, 0.4)',
      borderWidth: 0,
    },
    fence: {
      backgroundColor: 'rgba(15, 23, 42, 0.4)',
      borderWidth: 0,
    },
    bullet_list_icon: {
      color: '#818CF8',
    },
    ordered_list_icon: {
      color: '#818CF8',
    },
  },
};

const composeStyles = (
  variant: MarkdownVariant,
  overrides?: MarkdownProps['style']
): MarkdownProps['style'] => {
  const combined: MarkdownProps['style'] = {};

  Object.keys(baseStyles).forEach((key) => {
    const styleKey = key as keyof MarkdownProps['style'];
    combined[styleKey] = {
      ...(baseStyles[styleKey] || {}),
      ...(variants[variant]?.[styleKey] || {}),
    } as any;
  });

  if (overrides) {
    Object.keys(overrides).forEach((key) => {
      const styleKey = key as keyof MarkdownProps['style'];
      combined[styleKey] = {
        ...(combined[styleKey] || {}),
        ...(overrides[styleKey] || {}),
      } as any;
    });
  }

  return combined;
};

interface MarkdownTextProps {
  content?: string | null;
  variant?: MarkdownVariant;
  styleOverrides?: MarkdownProps['style'];
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, variant = 'light', styleOverrides }) => {
  if (!content) {
    return null;
  }

  return <Markdown style={composeStyles(variant, styleOverrides)}>{content}</Markdown>;
};
