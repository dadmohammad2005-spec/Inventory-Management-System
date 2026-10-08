from decimal import Decimal
from django.db import transaction
from rest_framework import serializers
from .models import Category, Product, Order, OrderItem


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(source='products.count', read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'description', 'product_count']
        read_only_fields = ['slug', 'product_count']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'sku',
            'category',
            'category_name',
            'cost_price',
            'selling_price',
            'stock_quantity',
            'is_low_stock',
            'created_at',
            'updated_at'
        ]

    def validate_sku(self, value):
        instance = getattr(self, 'instance', None)
        query = Product.objects.filter(sku__iexact=value)
        if instance:
            query = query.exclude(pk=instance.pk)
        if query.exists():
            raise serializers.ValidationError("A product with this SKU already exists.")
        return value.upper()

    def validate(self, attrs):
        cost_price = attrs.get('cost_price')
        selling_price = attrs.get('selling_price')
        if cost_price is not None and selling_price is not None:
            if selling_price < cost_price:
                # Warning or allowed with profit note, but validate non-negative
                pass
        return attrs


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id',
            'product',
            'product_name',
            'product_sku',
            'quantity',
            'price',
            'subtotal'
        ]
        extra_kwargs = {
            'price': {'required': False}
        }


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, required=False)
    items_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id',
            'order_id',
            'customer_name',
            'total_amount',
            'status',
            'items',
            'items_count',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['order_id', 'created_at', 'updated_at']

    def validate(self, attrs):
        status = attrs.get('status', Order.STATUS_PENDING)
        items_data = self.initial_data.get('items', [])
        
        # When creating a new order
        if not self.instance:
            if not items_data:
                raise serializers.ValidationError({"items": "At least one item is required to create an order."})
            
            # Validate item formats & positive quantities
            aggregated_quantities = {}
            for item_dict in items_data:
                prod_val = item_dict.get('product')
                prod_id = prod_val.id if hasattr(prod_val, 'id') else prod_val
                
                try:
                    qty = int(item_dict.get('quantity', 0))
                except (ValueError, TypeError):
                    raise serializers.ValidationError({"items": f"Quantity must be a valid integer for product {prod_id}."})

                if qty <= 0:
                    raise serializers.ValidationError({"items": f"Quantity must be at least 1 for product {prod_id}."})
                
                aggregated_quantities[prod_id] = aggregated_quantities.get(prod_id, 0) + qty

            # If creating directly as Completed, verify stock against aggregated quantities
            if status == Order.STATUS_COMPLETED:
                for prod_id, total_qty in aggregated_quantities.items():
                    try:
                        product = Product.objects.get(pk=prod_id)
                        if product.stock_quantity < total_qty:
                            raise serializers.ValidationError({
                                "items": f"Insufficient stock for '{product.name}'. Available: {product.stock_quantity}, requested: {total_qty}."
                            })
                    except Product.DoesNotExist:
                        raise serializers.ValidationError({"items": f"Product with ID {prod_id} not found."})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        # If items weren't parsed into validated_data by nested serializer due to custom input
        if not items_data and 'items' in self.initial_data:
            items_data = self.initial_data['items']

        status = validated_data.get('status', Order.STATUS_PENDING)
        
        # Prepare items and calculate total amount
        calculated_total = Decimal('0.00')
        processed_items = []
        product_deductions = {}
        
        for item_data in items_data:
            prod_id = item_data['product'] if isinstance(item_data['product'], int) else item_data['product'].id
            product = Product.objects.select_for_update().get(pk=prod_id)
            qty = int(item_data['quantity'])
            
            # Use provided price or default to product's current selling price
            price = Decimal(str(item_data.get('price', product.selling_price)))
            subtotal = (Decimal(qty) * price).quantize(Decimal('0.01'))
            calculated_total += subtotal
            
            processed_items.append({
                'product': product,
                'quantity': qty,
                'price': price
            })
            product_deductions[product.id] = product_deductions.get(product.id, 0) + qty

        if status == Order.STATUS_COMPLETED:
            for p_id, total_qty in product_deductions.items():
                p = Product.objects.get(pk=p_id)
                if p.stock_quantity < total_qty:
                    raise serializers.ValidationError(
                        f"Insufficient stock for '{p.name}'. In stock: {p.stock_quantity}, requested: {total_qty}."
                    )

        # Set or override total_amount with exact sum of items
        validated_data['total_amount'] = calculated_total
        order = Order.objects.create(**validated_data)

        # Create OrderItems
        for item in processed_items:
            OrderItem.objects.create(
                order=order,
                product=item['product'],
                quantity=item['quantity'],
                price=item['price']
            )

        # Deduct stock if Completed
        if status == Order.STATUS_COMPLETED:
            for p_id, total_qty in product_deductions.items():
                p = Product.objects.select_for_update().get(pk=p_id)
                p.stock_quantity -= total_qty
                p.save(update_fields=['stock_quantity', 'updated_at'])

        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        old_status = instance.status
        new_status = validated_data.get('status', old_status)

        # Handle stock updates on status changes
        if old_status != Order.STATUS_COMPLETED and new_status == Order.STATUS_COMPLETED:
            # Need to deduct stock for all items in this order
            for item in instance.items.select_related('product'):
                prod = Product.objects.select_for_update().get(pk=item.product_id)
                if prod.stock_quantity < item.quantity:
                    raise serializers.ValidationError(
                        f"Cannot mark order as Completed: Insufficient stock for '{prod.name}'. In stock: {prod.stock_quantity}, required: {item.quantity}."
                    )
                prod.stock_quantity -= item.quantity
                prod.save(update_fields=['stock_quantity', 'updated_at'])

        elif old_status == Order.STATUS_COMPLETED and new_status == Order.STATUS_CANCELLED:
            # Revert stock when a completed order is cancelled
            for item in instance.items.select_related('product'):
                prod = Product.objects.select_for_update().get(pk=item.product_id)
                prod.stock_quantity += item.quantity
                prod.save(update_fields=['stock_quantity', 'updated_at'])

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance
