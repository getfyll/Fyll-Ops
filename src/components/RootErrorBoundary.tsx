import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// No error boundary previously existed anywhere in this app. Without one, an
// uncaught render error in any single screen unmounts the entire React tree
// (since React walks up to the nearest boundary — the root — and tears
// everything down), which looks identical to "the whole app flashed and
// reloaded" when navigating. This surfaces the real error instead.
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootErrorBoundary caught a render error:', error, errorInfo.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#18181b', paddingTop: 60, paddingHorizontal: 20 }}>
        <Text style={{ color: '#F87171', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>
          Screen crashed
        </Text>
        <Text style={{ color: '#E4E4E7', fontSize: 14, marginBottom: 16 }}>
          {error.message}
        </Text>
        <ScrollView style={{ flex: 1, marginBottom: 16 }}>
          <Text style={{ color: '#A1A1AA', fontSize: 12, fontFamily: 'monospace' }}>
            {error.stack}
          </Text>
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
