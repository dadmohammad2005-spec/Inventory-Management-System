from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from inventory.models import Category, Product, Order, OrderItem


class Command(BaseCommand):
    help = 'Seeds initial sample data for Categories, Products, and Orders'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Seeding database with demo data...'))

        with transaction.atomic():
            # 1. Categories
            categories_data = [
                {'name': 'Electronics', 'description': 'Computers, gadgets, and consumer electronic hardware'},
                {'name': 'Office Supplies', 'description': 'Stationery, paper, pens, and desk essentials'},
                {'name': 'Computer Peripherals', 'description': 'Keyboards, mice, webcams, and monitors'},
                {'name': 'Ergonomic Furniture', 'description': 'Office chairs, standing desks, and monitor arms'},
                {'name': 'Audio & Headphones', 'description': 'Wireless headsets, microphones, and speakers'},
            ]

            category_objs = {}
            for c_data in categories_data:
                cat, created = Category.objects.get_or_create(
                    name=c_data['name'],
                    defaults={'description': c_data['description']}
                )
                category_objs[c_data['name']] = cat
                if created:
                    self.stdout.write(f"  + Created category: {cat.name}")

            # 2. Products
            products_data = [
                {
                    'name': 'Dell UltraSharp 27" 4K Monitor',
                    'sku': 'MON-DELL-U2723QE',
                    'category': category_objs['Electronics'],
                    'cost_price': Decimal('380.00'),
                    'selling_price': Decimal('549.99'),
                    'stock_quantity': 18,
                },
                {
                    'name': 'Logitech MX Master 3S Wireless Mouse',
                    'sku': 'PER-LOGI-MX3S',
                    'category': category_objs['Computer Peripherals'],
                    'cost_price': Decimal('60.00'),
                    'selling_price': Decimal('99.99'),
                    'stock_quantity': 42,
                },
                {
                    'name': 'Keychron Q1 Pro Mechanical Keyboard',
                    'sku': 'PER-KEY-Q1PRO',
                    'category': category_objs['Computer Peripherals'],
                    'cost_price': Decimal('130.00'),
                    'selling_price': Decimal('199.50'),
                    'stock_quantity': 3,  # Low stock item (< 5)
                },
                {
                    'name': 'Sony WH-1000XM5 Noise-Canceling Headphones',
                    'sku': 'AUD-SONY-XM5',
                    'category': category_objs['Audio & Headphones'],
                    'cost_price': Decimal('240.00'),
                    'selling_price': Decimal('379.00'),
                    'stock_quantity': 2,  # Low stock item (< 5)
                },
                {
                    'name': 'Shure MV7 USB Podcast Microphone',
                    'sku': 'AUD-SHU-MV7',
                    'category': category_objs['Audio & Headphones'],
                    'cost_price': Decimal('160.00'),
                    'selling_price': Decimal('249.00'),
                    'stock_quantity': 15,
                },
                {
                    'name': 'Herman Miller Aeron Ergonomic Chair',
                    'sku': 'FURN-HM-AERON',
                    'category': category_objs['Ergonomic Furniture'],
                    'cost_price': Decimal('850.00'),
                    'selling_price': Decimal('1395.00'),
                    'stock_quantity': 8,
                },
                {
                    'name': 'Electric Height Adjustable Standing Desk',
                    'sku': 'FURN-DESK-E7',
                    'category': category_objs['Ergonomic Furniture'],
                    'cost_price': Decimal('290.00'),
                    'selling_price': Decimal('499.00'),
                    'stock_quantity': 1,  # Low stock item (< 5)
                },
                {
                    'name': 'Anker 100W GaN Fast Charger 3-Port',
                    'sku': 'ELE-ANK-100W',
                    'category': category_objs['Electronics'],
                    'cost_price': Decimal('32.00'),
                    'selling_price': Decimal('59.99'),
                    'stock_quantity': 65,
                },
                {
                    'name': 'Premium Leather Desk Mat & Pad',
                    'sku': 'OFF-DESK-LEATH',
                    'category': category_objs['Office Supplies'],
                    'cost_price': Decimal('14.50'),
                    'selling_price': Decimal('34.99'),
                    'stock_quantity': 50,
                },
                {
                    'name': 'Gel Ink Pens 0.5mm (Pack of 12)',
                    'sku': 'OFF-PENS-12PK',
                    'category': category_objs['Office Supplies'],
                    'cost_price': Decimal('4.20'),
                    'selling_price': Decimal('12.99'),
                    'stock_quantity': 120,
                },
            ]

            product_objs = {}
            for p_data in products_data:
                sku = p_data['sku']
                prod, created = Product.objects.get_or_create(
                    sku=sku,
                    defaults=p_data
                )
                product_objs[sku] = prod
                if created:
                    self.stdout.write(f"  + Created product: {prod.name} (Stock: {prod.stock_quantity})")

            # 3. Sample Orders
            if not Order.objects.exists():
                # Order 1: Completed
                order1 = Order.objects.create(
                    customer_name='Acme Corp (John Doe)',
                    status=Order.STATUS_COMPLETED,
                    total_amount=Decimal('849.48')
                )
                OrderItem.objects.create(
                    order=order1,
                    product=product_objs['MON-DELL-U2723QE'],
                    quantity=1,
                    price=Decimal('549.99')
                )
                OrderItem.objects.create(
                    order=order1,
                    product=product_objs['PER-LOGI-MX3S'],
                    quantity=2,
                    price=Decimal('99.99')
                )
                OrderItem.objects.create(
                    order=order1,
                    product=product_objs['PER-LOGI-MX3S'],  # Note: just an item
                    quantity=1,
                    price=Decimal('99.51')
                )

                # Order 2: Completed
                order2 = Order.objects.create(
                    customer_name='Sophia Ramirez',
                    status=Order.STATUS_COMPLETED,
                    total_amount=Decimal('438.99')
                )
                OrderItem.objects.create(
                    order=order2,
                    product=product_objs['AUD-SONY-XM5'],
                    quantity=1,
                    price=Decimal('379.00')
                )
                OrderItem.objects.create(
                    order=order2,
                    product=product_objs['ELE-ANK-100W'],
                    quantity=1,
                    price=Decimal('59.99')
                )

                # Order 3: Pending
                order3 = Order.objects.create(
                    customer_name='Vertex Tech Labs (Marcus Lee)',
                    status=Order.STATUS_PENDING,
                    total_amount=Decimal('1894.00')
                )
                OrderItem.objects.create(
                    order=order3,
                    product=product_objs['FURN-HM-AERON'],
                    quantity=1,
                    price=Decimal('1395.00')
                )
                OrderItem.objects.create(
                    order=order3,
                    product=product_objs['FURN-DESK-E7'],
                    quantity=1,
                    price=Decimal('499.00')
                )

                self.stdout.write("  + Created 3 demo orders with line items.")

        self.stdout.write(self.style.SUCCESS('Successfully seeded database!'))
