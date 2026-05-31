class User:
    def __init__(self, name, age):
        self._name = name
        self._age = age
    
    def get_name(self):
        return self._name
    
    def set_name(self, name):
        self._name = name
    
    def get_age(self):
        return self._age
    
    def set_age(self, age):
        self._age = age
    
    def process_data_long_method(self, data):
        result = []
        for item in data:
            if item > 0:
                processed = item * 2
                result.append(processed)
            else:
                processed = item * 3
                result.append(processed)
        
        final = []
        for r in result:
            if r % 2 == 0:
                final.append(r + 1)
            else:
                final.append(r - 1)
        
        output = []
        for f in final:
            output.append(f * 10)
        
        return output
    
    def process_data_duplicate(self, data):
        result = []
        for item in data:
            if item > 0:
                processed = item * 2
                result.append(processed)
            else:
                processed = item * 3
                result.append(processed)
        
        final = []
        for r in result:
            if r % 2 == 0:
                final.append(r + 1)
            else:
                final.append(r - 1)
        
        output = []
        for f in final:
            output.append(f * 10)
        
        return output


class DataProcessor:
    def very_long_method(self, users, orders, products):
        user_summary = {}
        
        for user in users:
            if user.get_age() > 18:
                user_summary[user.get_name()] = {
                    'status': 'adult',
                    'orders': 0,
                    'total_spent': 0
                }
            else:
                user_summary[user.get_name()] = {
                    'status': 'minor',
                    'orders': 0,
                    'total_spent': 0
                }
        
        for order in orders:
            if order['user'] in user_summary:
                user_summary[order['user']]['orders'] += 1
                for item in order['items']:
                    product = products.get(item['product_id'])
                    if product:
                        user_summary[order['user']]['total_spent'] += product['price'] * item['quantity']
        
        final_report = []
        for username, data in user_summary.items():
            if data['orders'] > 0:
                avg_order = data['total_spent'] / data['orders']
            else:
                avg_order = 0
            
            final_report.append({
                'username': username,
                'status': data['status'],
                'total_orders': data['orders'],
                'total_spent': data['total_spent'],
                'average_order': avg_order
            })
        
        return final_report
