// Example component test (React Native Testing Library {{rntlMajor}}).
// Queries by role/label/text first; testID only as a last resort.
// Jest globals are imported explicitly so the file type-checks even when tsconfig doesn't load @types/jest (TypeScript 6).
import { expect, jest, test } from '@jest/globals';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <View>
      <Text>Count: {count}</Text>
      <Pressable accessibilityRole="button" onPress={() => setCount((c) => c + 1)}>
        <Text>Add one</Text>
      </Pressable>
    </View>
  );
}

jest.useFakeTimers();

test('pressing the button increments the count', async () => {
  const user = userEvent.setup();
  {{await}}render(<Counter />);

  await user.press(screen.getByRole('button', { name: 'Add one' }));

  expect(screen.getByText('Count: 1')).toBeOnTheScreen();
});
