import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import VoiceLoginScreen from './screens/VoiceLoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import BookingScreen from './screens/BookingScreen';
import MeetingScreen from './screens/MeetingScreen';
import MeetingSummaryScreen from './screens/MeetingSummaryScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen 
          name="Login" 
          component={VoiceLoginScreen} 
          options={{ title: '声纹登录' }}
        />
        <Stack.Screen 
          name="Register" 
          component={RegisterScreen} 
          options={{ title: '声纹注册' }}
        />
        <Stack.Screen 
          name="Booking" 
          component={BookingScreen} 
          options={{ title: '会议室预订' }}
        />
        <Stack.Screen 
          name="Meeting" 
          component={MeetingScreen} 
          options={{ title: '智能会议' }}
        />
        <Stack.Screen 
          name="MeetingSummary" 
          component={MeetingSummaryScreen} 
          options={{ title: '会议纪要' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}