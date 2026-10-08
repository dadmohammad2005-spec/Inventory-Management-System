from decimal import Decimal
from django.db.models import Sum, Count, Q, F
from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action

from .models import Category, Product, Order, OrderItem
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    OrderSerializer,
    OrderItemSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Categories.
    """
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'id']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        product_count = instance.products.count()
        if product_count > 0:
            return Response(
                {"error": f"Cannot delete category '{instance.name}' because it contains {product_count} product(s). Please reassign or delete those products first."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


class ProductViewSet(viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Products.
    Supports filtering by category, low_stock status, and search by name/SKU.
    """
    queryset = Product.objects.select_related('category').all()
    serializer_class = ProductSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'sku']
    ordering_fields = ['name', 'selling_price', 'stock_quantity', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        
        # Filter by category ID or slug
        category_param = self.request.query_params.get('category')
        if category_param:
            if category_param.isdigit():
                qs = qs.filter(category_id=category_param)
            else:
                qs = qs.filter(category__slug=category_param)
                
        # Filter by low stock (< 5)
        low_stock_param = self.request.query_params.get('low_stock')
        if low_stock_param is not None and low_stock_param.lower() in ['true', '1', 'yes']:
            qs = qs.filter(stock_quantity__lt=5)

        # Filter by stock status: in_stock, out_of_stock
        stock_status = self.request.query_params.get('stock_status')
        if stock_status == 'out_of_stock':
            qs = qs.filter(stock_quantity=0)
        elif stock_status == 'in_stock':
            qs = qs.filter(stock_quantity__gt=0)

        return qs

    @action(detail=True, methods=['post'])
    def restock(self, request, pk=None):
        """
        Quick restock action: increments product stock by specified amount.
        """
        product = self.get_object()
        quantity_to_add = request.data.get('quantity')
        
        try:
            quantity_to_add = int(quantity_to_add)
            if quantity_to_add <= 0:
                return Response(
                    {"error": "Restock quantity must be a positive integer."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (TypeError, ValueError):
            return Response(
                {"error": "Valid quantity number is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        product.stock_quantity += quantity_to_add
        product.save(update_fields=['stock_quantity', 'updated_at'])
        
        serializer = self.get_serializer(product)
        return Response({
            "message": f"Successfully added {quantity_to_add} units to {product.name}.",
            "product": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        """
        Exports filtered or all products as CSV.
        """
        import csv
        from django.http import HttpResponse

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="inventory_products.csv"'

        writer = csv.writer(response)
        writer.writerow(['SKU', 'Product Name', 'Category', 'Cost Price (₹)', 'Selling Price (₹)', 'Stock Quantity', 'Low Stock Alert', 'Created At'])

        products = self.filter_queryset(self.get_queryset())
        for p in products:
            writer.writerow([
                p.sku,
                p.name,
                p.category.name if p.category else '',
                f"{p.cost_price:.2f}",
                f"{p.selling_price:.2f}",
                p.stock_quantity,
                'YES' if p.is_low_stock else 'NO',
                p.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])

        return response


class OrderViewSet(viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Orders.
    Handles order creation with nested items and stock updates upon completion.
    """
    queryset = Order.objects.prefetch_related('items__product').all()
    serializer_class = OrderSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['order_id', 'customer_name']
    ordering_fields = ['created_at', 'total_amount', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        return qs

    @action(detail=True, methods=['post'])
    def mark_completed(self, request, pk=None):
        """
        Transitions order status to 'Completed' and reduces stock levels.
        """
        order = self.get_object()
        if order.status == Order.STATUS_COMPLETED:
            return Response(
                {"message": "Order is already marked as Completed."},
                status=status.HTTP_200_OK
            )

        serializer = self.get_serializer(order, data={'status': Order.STATUS_COMPLETED}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            "message": f"Order #{order.order_id} marked as Completed. Stock levels updated.",
            "order": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def mark_cancelled(self, request, pk=None):
        """
        Transitions order status to 'Cancelled'. Reverts stock if order was previously completed.
        """
        order = self.get_object()
        if order.status == Order.STATUS_CANCELLED:
            return Response(
                {"message": "Order is already marked as Cancelled."},
                status=status.HTTP_200_OK
            )

        serializer = self.get_serializer(order, data={'status': Order.STATUS_CANCELLED}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            "message": f"Order #{order.order_id} has been Cancelled.",
            "order": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        """
        Exports filtered or all orders as CSV.
        """
        import csv
        from django.http import HttpResponse

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="orders_history.csv"'

        writer = csv.writer(response)
        writer.writerow(['Order ID', 'Customer Name', 'Status', 'Total Amount (₹)', 'Items Count', 'Created At'])

        orders = self.filter_queryset(self.get_queryset())
        for o in orders:
            writer.writerow([
                o.order_id,
                o.customer_name,
                o.status,
                f"{o.total_amount:.2f}",
                o.items.count(),
                o.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])

        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == Order.STATUS_COMPLETED:
            return Response(
                {"error": f"Cannot delete completed order #{instance.order_id}. Please cancel the order first to restore inventory."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


class AnalyticsView(APIView):
    """
    REST endpoint providing executive dashboard analytics:
    - Total revenue (sum of completed orders)
    - Low-stock items count (< 5 items)
    - Total orders count
    - Additional business metrics (total products, status breakdown, recent orders)
    """
    def get(self, request):
        # Total revenue from Completed orders
        revenue_aggregate = Order.objects.filter(
            status=Order.STATUS_COMPLETED
        ).aggregate(total_revenue=Sum('total_amount'))
        total_revenue = revenue_aggregate['total_revenue'] or Decimal('0.00')

        # Total order counts
        total_orders = Order.objects.count()
        completed_orders = Order.objects.filter(status=Order.STATUS_COMPLETED).count()
        pending_orders = Order.objects.filter(status=Order.STATUS_PENDING).count()
        cancelled_orders = Order.objects.filter(status=Order.STATUS_CANCELLED).count()

        # Product metrics
        total_products = Product.objects.count()
        low_stock_qs = Product.objects.filter(stock_quantity__lt=5).select_related('category')
        low_stock_count = low_stock_qs.count()
        out_of_stock_count = Product.objects.filter(stock_quantity=0).count()

        # Top 5 low stock products details
        low_stock_serialized = ProductSerializer(low_stock_qs[:10], many=True).data

        # Recent 5 orders
        recent_orders_qs = Order.objects.prefetch_related('items__product')[:5]
        recent_orders_serialized = OrderSerializer(recent_orders_qs, many=True).data

        # Top selling products
        top_selling = (
            OrderItem.objects.filter(order__status=Order.STATUS_COMPLETED)
            .values('product__id', 'product__name', 'product__sku')
            .annotate(total_sold=Sum('quantity'), total_revenue=Sum(F('quantity') * F('price')))
            .order_by('-total_sold')[:5]
        )

        return Response({
            "total_revenue": float(total_revenue),
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "total_orders": total_orders,
            "total_products": total_products,
            "orders_breakdown": {
                "completed": completed_orders,
                "pending": pending_orders,
                "cancelled": cancelled_orders
            },
            "low_stock_products": low_stock_serialized,
            "recent_orders": recent_orders_serialized,
            "top_selling_products": list(top_selling)
        }, status=status.HTTP_200_OK)
