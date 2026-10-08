from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from .models import Category, Product, Order, OrderItem


class InventorySystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name='Hardware', description='Hardware accessories')
        self.product1 = Product.objects.create(
            name='Mechanical Keyboard',
            sku='KB-001',
            category=self.category,
            cost_price=Decimal('50.00'),
            selling_price=Decimal('100.00'),
            stock_quantity=10
        )
        self.product2 = Product.objects.create(
            name='Wireless Mouse',
            sku='MS-002',
            category=self.category,
            cost_price=Decimal('20.00'),
            selling_price=Decimal('40.00'),
            stock_quantity=3  # Low stock (< 5)
        )

    def test_low_stock_property(self):
        self.assertFalse(self.product1.is_low_stock)
        self.assertTrue(self.product2.is_low_stock)

    def test_category_slug_generation(self):
        cat = Category.objects.create(name='Smart Devices')
        self.assertEqual(cat.slug, 'smart-devices')

    def test_create_completed_order_reduces_stock(self):
        url = reverse('order-list')
        payload = {
            'customer_name': 'Alice Wonder',
            'status': 'Completed',
            'items': [
                {
                    'product': self.product1.id,
                    'quantity': 4,
                    'price': '100.00'
                }
            ]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify stock was reduced from 10 to 6
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock_quantity, 6)

    def test_insufficient_stock_prevents_order_completion(self):
        url = reverse('order-list')
        payload = {
            'customer_name': 'Bob Excess',
            'status': 'Completed',
            'items': [
                {
                    'product': self.product2.id,
                    'quantity': 10,  # Only 3 in stock
                    'price': '40.00'
                }
            ]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Stock remains untouched
        self.product2.refresh_from_db()
        self.assertEqual(self.product2.stock_quantity, 3)

    def test_pending_order_does_not_reduce_stock_until_completed(self):
        url = reverse('order-list')
        payload = {
            'customer_name': 'Charlie Quote',
            'status': 'Pending',
            'items': [
                {
                    'product': self.product1.id,
                    'quantity': 2,
                    'price': '100.00'
                }
            ]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order_id = response.data['id']

        # Stock should still be 10 while pending
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock_quantity, 10)

        # Mark as completed
        complete_url = reverse('order-mark-completed', kwargs={'pk': order_id})
        complete_res = self.client.post(complete_url)
        self.assertEqual(complete_res.status_code, status.HTTP_200_OK)

        # Now stock must be reduced to 8
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock_quantity, 8)

    def test_cancelling_completed_order_restores_stock(self):
        order = Order.objects.create(
            customer_name='Dave Reversal',
            status='Completed',
            total_amount=Decimal('100.00')
        )
        OrderItem.objects.create(
            order=order,
            product=self.product1,
            quantity=3,
            price=Decimal('100.00')
        )
        self.product1.stock_quantity -= 3
        self.product1.save()
        self.assertEqual(self.product1.stock_quantity, 7)

        # Cancel order
        cancel_url = reverse('order-mark-cancelled', kwargs={'pk': order.id})
        res = self.client.post(cancel_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Stock must be restored to 10
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock_quantity, 10)

    def test_analytics_endpoint(self):
        # Create a completed order
        order = Order.objects.create(
            customer_name='Emma Test',
            status='Completed',
            total_amount=Decimal('250.00')
        )
        OrderItem.objects.create(
            order=order,
            product=self.product1,
            quantity=2,
            price=Decimal('125.00')
        )

        analytics_url = reverse('analytics')
        res = self.client.get(analytics_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        data = res.data
        self.assertEqual(data['total_revenue'], 250.0)
        self.assertEqual(data['total_orders'], 1)
        # product2 has stock 3 (< 5), so low_stock_count should be at least 1
        self.assertGreaterEqual(data['low_stock_count'], 1)
        self.assertEqual(data['total_products'], 2)

    def test_category_protection_on_delete(self):
        # Category has product1 and product2, deletion must fail
        cat_url = reverse('category-detail', kwargs={'pk': self.category.id})
        res = self.client.delete(cat_url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot delete category', res.data['error'])

        # Empty category can be deleted
        empty_cat = Category.objects.create(name='Temporary Empty')
        empty_url = reverse('category-detail', kwargs={'pk': empty_cat.id})
        res_empty = self.client.delete(empty_url)
        self.assertEqual(res_empty.status_code, status.HTTP_204_NO_CONTENT)

    def test_product_restock_endpoint(self):
        restock_url = reverse('product-restock', kwargs={'pk': self.product1.id})
        res = self.client.post(restock_url, {'quantity': 15}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock_quantity, 25)

        # Invalid quantity
        res_invalid = self.client.post(restock_url, {'quantity': -5}, format='json')
        self.assertEqual(res_invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_csv_export_endpoints(self):
        # Product CSV
        prod_csv_url = reverse('product-export-csv')
        res_prod = self.client.get(prod_csv_url)
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        self.assertEqual(res_prod['Content-Type'], 'text/csv')
        self.assertIn('Mechanical Keyboard', res_prod.content.decode())

        # Order CSV
        order_csv_url = reverse('order-export-csv')
        res_order = self.client.get(order_csv_url)
        self.assertEqual(res_order.status_code, status.HTTP_200_OK)
        self.assertEqual(res_order['Content-Type'], 'text/csv')

    def test_prevent_delete_completed_order(self):
        order = Order.objects.create(
            customer_name='George Protected',
            status=Order.STATUS_COMPLETED,
            total_amount=Decimal('100.00')
        )
        order_url = reverse('order-detail', kwargs={'pk': order.id})
        res = self.client.delete(order_url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot delete completed order', res.data['error'])

    def test_frontend_serving_at_root(self):
        res = self.client.get('/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        content = b"".join(res.streaming_content).decode() if hasattr(res, 'streaming_content') else res.content.decode()
        self.assertIn('StockFlow', content)

    def test_order_creation_aggregates_duplicate_items(self):
        # Product 2 only has 3 in stock. Sending 2 items of 2 units each = 4 > 3, must fail
        url = reverse('order-list')
        payload = {
            'customer_name': 'Duplicate Aggregator',
            'status': 'Completed',
            'items': [
                {'product': self.product2.id, 'quantity': 2, 'price': '40.00'},
                {'product': self.product2.id, 'quantity': 2, 'price': '40.00'},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Insufficient stock', str(res.data))
