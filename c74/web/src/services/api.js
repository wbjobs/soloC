const API_URL = 'http://localhost:3000/api';

export async function fetchBookings() {
  const response = await fetch(`${API_URL}/bookings`);
  return response.json();
}

export async function fetchHeatmapData(startDate, endDate) {
  const response = await fetch(`${API_URL}/bookings/heatmap?startDate=${startDate}&endDate=${endDate}`);
  return response.json();
}

export async function fetchRooms() {
  const response = await fetch(`${API_URL}/rooms`);
  return response.json();
}